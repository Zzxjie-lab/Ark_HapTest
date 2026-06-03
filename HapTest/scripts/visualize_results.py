#!/usr/bin/env python3
"""
HapTest 实验数据可视化工具

从 collect_results.js 生成的 16 列 CSV 中读取数据，生成 6 张对比图表，
直接支撑开题报告 4.2 全部量化指标。

用法:
    python scripts/visualize_results.py results.csv
    python scripts/visualize_results.py results.csv -o charts/ --dpi 200
"""

import argparse
import os
import sys
import math
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POLICY_COLORS = {
    "greedy_dfs": "#2B7CE9",
    "enhanced_guided": "#EB7D26",
    "enhanced": "#EB7D26",
    "static_guided": "#4CAF50",
    "greedy_bfs": "#7B2CE9",
    "random": "#999999",
}

TARGET_COV_STATEMENT = 60.0
TARGET_COV_BRANCH = 50.0
TARGET_EVENTS_REDUCTION = -30.0
TARGET_COVERAGE_GAIN = 20.0
NA_VALUE = -1

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

def setup_matplotlib() -> None:
    """配置 matplotlib 中文字体和样式。"""
    matplotlib.use("Agg")  # 无头模式，无需 GUI

    # 先设置样式
    plt.style.use("seaborn-v0_8-whitegrid")

    # 探测中文字体 — 使用 FontProperties 显式指定
    import matplotlib.font_manager as fm
    font_names = [f.name for f in fm.fontManager.ttflist]
    preferred = ["Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "WenQuanYi Micro Hei"]
    chosen = None
    for name in preferred:
        if name in font_names:
            chosen = name
            break

    if chosen:
        plt.rcParams["font.family"] = "sans-serif"
        plt.rcParams["font.sans-serif"] = [chosen, "DejaVu Sans"]
        # 清除字体缓存以确保生效
        fm._load_fontmanager(try_read_cache=False)
        print(f"  [字体] 使用: {chosen}")
    else:
        plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
        print("  [字体] 警告: 未找到中文字体，图表将使用英文")

    plt.rcParams["axes.unicode_minus"] = False
    plt.rcParams["figure.dpi"] = 150
    plt.rcParams["savefig.dpi"] = 200
    plt.rcParams["savefig.bbox"] = "tight"
    plt.rcParams["axes.titlesize"] = 13
    plt.rcParams["axes.labelsize"] = 11
    plt.rcParams["xtick.labelsize"] = 9
    plt.rcParams["ytick.labelsize"] = 9

# ---------------------------------------------------------------------------
# Data Layer
# ---------------------------------------------------------------------------

def parse_csv(filepath: str) -> pd.DataFrame:
    """读取 CSV，兼容旧 9 列格式（补齐缺失列）。"""
    if not os.path.exists(filepath):
        print(f"[错误] CSV 文件不存在: {filepath}")
        sys.exit(1)

    df = pd.read_csv(filepath, on_bad_lines="warn")

    # 去除空行
    df = df.dropna(how="all")

    # 兼容旧格式：补齐缺失列
    full_columns = [
        "project", "policy", "result_time",
        "events", "ptg_nodes", "ptg_edges", "screenshots", "crashes", "duration",
        "cov_statement", "cov_branch", "cov_function",
        "events_per_cov_pct", "crashes_per_1000ev",
        "uiability_count",
    ]
    for col in full_columns:
        if col not in df.columns:
            df[col] = NA_VALUE

    # 只保留需要的列
    df = df[full_columns]
    return df


def aggregate_experiments(df: pd.DataFrame) -> pd.DataFrame:
    """按 (project, policy) 聚合多轮测试求均值。"""
    # 覆盖率类列：-1 视为 NaN 后求均值
    cov_cols = ["cov_statement", "cov_branch", "cov_function",
                "events_per_cov_pct", "crashes_per_1000ev"]

    agg_specs = {}
    for col in df.columns:
        if col in cov_cols:
            agg_specs[col] = lambda x: (
                x[x >= 0].mean() if (x >= 0).any() else NA_VALUE
            )
        elif col in ("events", "ptg_nodes", "ptg_edges", "screenshots",
                      "crashes", "duration", "uiability_count"):
            agg_specs[col] = "mean"
        # project, policy, result_time handled by groupby keys

    grouped = df.groupby(["project", "policy"], as_index=False)
    df_agg = grouped.agg(agg_specs)
    return df_agg

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def short_name(project: str) -> str:
    """截短项目名称。"com.example." 前缀移除，超过 18 字符截断。"""
    name = str(project).replace("com.example.", "").replace("com.", "")
    if len(name) > 20:
        name = name[:18] + ".."
    return name


def is_valid(val) -> bool:
    """值是否有效（非 None、非 NaN、非 -1）。"""
    if val is None:
        return False
    try:
        fv = float(val)
        return not (math.isnan(fv) or fv <= NA_VALUE)
    except (TypeError, ValueError):
        return False


def fmt_pct(val, dp=1) -> str:
    """格式化百分比值。"""
    if is_valid(val):
        return f"{float(val):.{dp}f}%"
    return "N/A"


def fmt_diff(val, dp=1) -> str:
    """格式化差值（带符号）。"""
    if is_valid(val):
        v = float(val)
        sign = "+" if v >= 0 else ""
        return f"{sign}{v:.{dp}f}%p"
    return "N/A"


def annotate_bar_pair(ax, bar1, bar2, v1, v2, fmt_fn=fmt_diff):
    """在双柱之间标注差值。"""
    if is_valid(v1) and is_valid(v2):
        diff = float(v2) - float(v1)
        height = max(bar2.get_height(), bar1.get_height())
        ax.text(
            bar2.get_x() + bar2.get_width() / 2,
            height + ax.get_ylim()[1] * 0.01,
            f"{diff:+.1f}",
            ha="center", va="bottom", fontsize=8,
            color="#2ECC40" if diff > 0 else ("#FF4136" if diff < 0 else "#666"),
            fontweight="bold",
        )


def add_target_line(ax, value, label, color="red", linestyle="--", linewidth=1.2, alpha=0.7):
    """添加水平目标线。"""
    ax.axhline(y=value, color=color, linestyle=linestyle, linewidth=linewidth, alpha=alpha)
    ax.text(ax.get_xlim()[1] - 0.2, value + ax.get_ylim()[1] * 0.01,
            label, ha="right", va="bottom", fontsize=8, color=color, alpha=alpha)


def get_bar_centers(bar_container):
    """获取 bar container 中各 bar 的中心 x 坐标。"""
    return [bar.get_x() + bar.get_width() / 2 for bar in bar_container]


# ---------------------------------------------------------------------------
# Chart 1: 覆盖率综合对比
# ---------------------------------------------------------------------------

def chart1_coverage_comparison(df_agg: pd.DataFrame, output_dir: str) -> None:
    """1×3 子图：语句/分支/函数覆盖率分组柱状图。"""
    projects = sorted(df_agg["project"].unique())
    if not projects:
        print("  [跳过] Chart 1: 无项目数据")
        return

    n = len(projects)
    fig, axes = plt.subplots(1, 3, figsize=(max(12, 3.5 * n), 6))
    cov_pairs = [
        ("cov_statement", "语句覆盖率", TARGET_COV_STATEMENT),
        ("cov_branch", "分支覆盖率", TARGET_COV_BRANCH),
        ("cov_function", "函数覆盖率", None),
    ]

    x = np.arange(n)
    width = 0.35

    for idx, (col, title, target) in enumerate(cov_pairs):
        ax = axes[idx]
        greedy_vals = []
        enhanced_vals = []

        for proj in projects:
            pg = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "greedy_dfs")]
            pe = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "enhanced_guided")]
            gv = float(pg[col].iloc[0]) if len(pg) > 0 else NA_VALUE
            ev = float(pe[col].iloc[0]) if len(pe) > 0 else NA_VALUE
            greedy_vals.append(gv)
            enhanced_vals.append(ev)

        # 绘制有效值柱
        g_valid = [v if is_valid(v) else 0 for v in greedy_vals]
        e_valid = [v if is_valid(v) else 0 for v in enhanced_vals]

        bars1 = ax.bar(x - width / 2, g_valid, width, color=POLICY_COLORS["greedy_dfs"],
                        label="Greedy DFS (基准)" if idx == 0 else "")
        bars2 = ax.bar(x + width / 2, e_valid, width, color=POLICY_COLORS["enhanced_guided"],
                        label="Enhanced Guided (改进)" if idx == 0 else "")

        # 标注 N/A 或差值
        for i in range(n):
            if not is_valid(greedy_vals[i]) or not is_valid(enhanced_vals[i]):
                # N/A 标注
                ax.text(x[i], 5, "N/A", ha="center", fontsize=9,
                        color="#999", fontstyle="italic")
            else:
                annotate_bar_pair(ax, bars1[i], bars2[i],
                                  greedy_vals[i], enhanced_vals[i])

        if target is not None:
            add_target_line(ax, target, f"目标 {target:.0f}%")

        ax.set_title(title)
        ax.set_xticks(x)
        ax.set_xticklabels([short_name(p) for p in projects], rotation=25, ha="right")
        ax.set_ylabel("覆盖率 (%)")
        ax.set_ylim(0, 105)

    if idx == 0:
        fig.legend(loc="upper center", ncol=2, fontsize=10, bbox_to_anchor=(0.5, 1.01))

    fig.suptitle("覆盖率综合对比 (Enhanced Guided vs Greedy DFS)", fontsize=14, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.93])

    outpath = os.path.join(output_dir, "cov_comparison.png")
    fig.savefig(outpath)
    plt.close(fig)
    print(f"  [OK] {outpath}")

# ---------------------------------------------------------------------------
# Chart 2: 探索效率对比
# ---------------------------------------------------------------------------

def chart2_efficiency(df_agg: pd.DataFrame, output_dir: str) -> None:
    """2×1 子图：events 数量 + 探索效率对比。"""
    projects = sorted(df_agg["project"].unique())
    if not projects:
        print("  [跳过] Chart 2: 无项目数据")
        return

    n = len(projects)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(max(10, 2.2 * n), 10))
    x = np.arange(n)
    width = 0.35

    # 上: events 总数
    greedy_ev = []
    enhanced_ev = []
    for proj in projects:
        pg = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "greedy_dfs")]
        pe = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "enhanced_guided")]
        greedy_ev.append(float(pg["events"].iloc[0]) if len(pg) > 0 else 0)
        enhanced_ev.append(float(pe["events"].iloc[0]) if len(pe) > 0 else 0)

    ax1.bar(x - width / 2, greedy_ev, width, color=POLICY_COLORS["greedy_dfs"], label="Greedy DFS")
    ax1.bar(x + width / 2, enhanced_ev, width, color=POLICY_COLORS["enhanced_guided"], label="Enhanced Guided")

    # 标注减少百分比
    for i in range(n):
        if greedy_ev[i] > 0 and enhanced_ev[i] > 0:
            reduction = (greedy_ev[i] - enhanced_ev[i]) / greedy_ev[i] * 100
            h = max(greedy_ev[i], enhanced_ev[i])
            color = "#2ECC40" if reduction > 0 else "#FF4136"
            ax1.text(x[i], h + ax1.get_ylim()[1] * 0.01,
                     f"{-reduction:+.0f}%" if reduction > 0 else f"{reduction:+.0f}%",
                     ha="center", fontsize=9, color=color, fontweight="bold")

    ax1.set_title("探索事件数量 (越少=效率越高)")
    ax1.set_xticks(x)
    ax1.set_xticklabels([])
    ax1.set_ylabel("Events 总数")
    ax1.legend(fontsize=10)

    # 下: events_per_cov_pct
    greedy_eff = []
    enhanced_eff = []
    for proj in projects:
        pg = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "greedy_dfs")]
        pe = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "enhanced_guided")]
        gv = float(pg["events_per_cov_pct"].iloc[0]) if len(pg) > 0 else NA_VALUE
        ev = float(pe["events_per_cov_pct"].iloc[0]) if len(pe) > 0 else NA_VALUE
        greedy_eff.append(gv if is_valid(gv) else 0)
        enhanced_eff.append(ev if is_valid(ev) else 0)

    ax2.bar(x - width / 2, greedy_eff, width, color=POLICY_COLORS["greedy_dfs"])
    ax2.bar(x + width / 2, enhanced_eff, width, color=POLICY_COLORS["enhanced_guided"])

    for i in range(n):
        if greedy_eff[i] > 0 and enhanced_eff[i] > 0:
            h = max(greedy_eff[i], enhanced_eff[i])
            ax2.text(x[i], h + ax2.get_ylim()[1] * 0.01,
                     f"{enhanced_eff[i]:.1f}", ha="center", fontsize=8, color="#666")

    ax2.set_title("探索效率 e/cov% (每%覆盖率所需事件数，越低越好)")
    ax2.set_xticks(x)
    ax2.set_xticklabels([short_name(p) for p in projects], rotation=25, ha="right")
    ax2.set_ylabel("events / cov%")

    fig.suptitle("探索效率对比 (Enhanced Guided vs Greedy DFS)", fontsize=14, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.95])

    outpath = os.path.join(output_dir, "efficiency.png")
    fig.savefig(outpath)
    plt.close(fig)
    print(f"  [OK] {outpath}")

# ---------------------------------------------------------------------------
# Chart 3: PTG 完整性对比
# ---------------------------------------------------------------------------

def chart3_ptg_comparison(df_agg: pd.DataFrame, output_dir: str) -> None:
    """2×1 子图：PTG nodes + edges 对比。"""
    projects = sorted(df_agg["project"].unique())
    if not projects:
        print("  [跳过] Chart 3: 无项目数据")
        return

    n = len(projects)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(max(10, 2.2 * n), 10))
    x = np.arange(n)
    width = 0.35

    for ax, col, title in [(ax1, "ptg_nodes", "PTG 节点数"),
                            (ax2, "ptg_edges", "PTG 边数")]:
        greedy_vals = []
        enhanced_vals = []
        for proj in projects:
            pg = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "greedy_dfs")]
            pe = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "enhanced_guided")]
            greedy_vals.append(float(pg[col].iloc[0]) if len(pg) > 0 else 0)
            enhanced_vals.append(float(pe[col].iloc[0]) if len(pe) > 0 else 0)

        ax.bar(x - width / 2, greedy_vals, width, color=POLICY_COLORS["greedy_dfs"],
               label="Greedy DFS" if col == "ptg_nodes" else "")
        ax.bar(x + width / 2, enhanced_vals, width, color=POLICY_COLORS["enhanced_guided"],
               label="Enhanced Guided" if col == "ptg_nodes" else "")

        for i in range(n):
            h = max(greedy_vals[i], enhanced_vals[i])
            diff = enhanced_vals[i] - greedy_vals[i]
            if diff != 0:
                ax.text(x[i], h + ax.get_ylim()[1] * 0.03,
                        f"{diff:+.0f}", ha="center", fontsize=8,
                        color="#2ECC40" if diff > 0 else "#999",
                        fontweight="bold")

        ax.set_title(title)
        ax.set_xticks(x)
        ax.set_xticklabels([] if col == "ptg_nodes" else [short_name(p) for p in projects],
                          rotation=25, ha="right")
        ax.set_ylabel("数量")

    if len(projects) > 0:
        fig.legend(loc="upper center", ncol=2, fontsize=10, bbox_to_anchor=(0.5, 1.01))

    fig.suptitle("PTG 完整性对比", fontsize=14, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.93])

    outpath = os.path.join(output_dir, "ptg_comparison.png")
    fig.savefig(outpath)
    plt.close(fig)
    print(f"  [OK] {outpath}")

# ---------------------------------------------------------------------------
# Chart 4: 崩溃检测对比
# ---------------------------------------------------------------------------

def chart4_crash_comparison(df_agg: pd.DataFrame, output_dir: str) -> None:
    """2×1 子图：崩溃总数 + 崩溃密度对比。"""
    projects = sorted(df_agg["project"].unique())
    if not projects:
        print("  [跳过] Chart 4: 无项目数据")
        return

    n = len(projects)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(max(10, 2.2 * n), 10))
    x = np.arange(n)
    width = 0.35

    # 上: 崩溃总数
    greedy_cr = []
    enhanced_cr = []
    for proj in projects:
        pg = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "greedy_dfs")]
        pe = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "enhanced_guided")]
        greedy_cr.append(float(pg["crashes"].iloc[0]) if len(pg) > 0 else 0)
        enhanced_cr.append(float(pe["crashes"].iloc[0]) if len(pe) > 0 else 0)

    ax1.bar(x - width / 2, greedy_cr, width, color=POLICY_COLORS["greedy_dfs"], label="Greedy DFS")
    ax1.bar(x + width / 2, enhanced_cr, width, color=POLICY_COLORS["enhanced_guided"], label="Enhanced Guided")
    for i in range(n):
        h = max(greedy_cr[i], enhanced_cr[i])
        diff = enhanced_cr[i] - greedy_cr[i]
        if diff != 0:
            ax1.text(x[i], h + ax1.get_ylim()[1] * 0.02,
                     f"{diff:+.0f}", ha="center", fontsize=8,
                     color="#2ECC40" if diff <= 0 else "#FF4136", fontweight="bold")
    ax1.set_title("崩溃总数")
    ax1.set_xticks(x)
    ax1.set_xticklabels([])
    ax1.set_ylabel("崩溃数")
    ax1.legend(fontsize=10)

    # 下: 崩溃密度
    greedy_cd = []
    enhanced_cd = []
    for proj in projects:
        pg = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "greedy_dfs")]
        pe = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "enhanced_guided")]
        gv = float(pg["crashes_per_1000ev"].iloc[0]) if len(pg) > 0 else NA_VALUE
        ev = float(pe["crashes_per_1000ev"].iloc[0]) if len(pe) > 0 else NA_VALUE
        greedy_cd.append(gv if is_valid(gv) else 0)
        enhanced_cd.append(ev if is_valid(ev) else 0)

    ax2.bar(x - width / 2, greedy_cd, width, color=POLICY_COLORS["greedy_dfs"])
    ax2.bar(x + width / 2, enhanced_cd, width, color=POLICY_COLORS["enhanced_guided"])
    ax2.set_title("崩溃密度 (crashes/1000 events，越低越好)")
    ax2.set_xticks(x)
    ax2.set_xticklabels([short_name(p) for p in projects], rotation=25, ha="right")
    ax2.set_ylabel("崩溃/千事件")

    fig.suptitle("崩溃检测对比", fontsize=14, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.95])

    outpath = os.path.join(output_dir, "crash_comparison.png")
    fig.savefig(outpath)
    plt.close(fig)
    print(f"  [OK] {outpath}")

# ---------------------------------------------------------------------------
# Chart 5: 覆盖提升汇总
# ---------------------------------------------------------------------------

def chart5_coverage_gain(df_agg: pd.DataFrame, output_dir: str) -> None:
    """横向柱状图：每个项目的语句覆盖率增益。"""
    projects = sorted(df_agg["project"].unique())
    if not projects:
        print("  [跳过] Chart 5: 无项目数据")
        return

    gains = []
    labels = []
    colors = []

    for proj in projects:
        pg = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "greedy_dfs")]
        pe = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == "enhanced_guided")]
        gv = float(pg["cov_statement"].iloc[0]) if len(pg) > 0 else NA_VALUE
        ev = float(pe["cov_statement"].iloc[0]) if len(pe) > 0 else NA_VALUE

        labels.append(short_name(proj))
        if is_valid(gv) and is_valid(ev):
            gain = ev - gv
            gains.append(gain)
            colors.append("#2ECC40" if gain > 0 else ("#FF4136" if gain < 0 else "#999"))
        else:
            gains.append(0)
            colors.append("#CCCCCC")

    fig, ax = plt.subplots(figsize=(10, max(5, 0.5 * len(projects) + 2)))
    y_pos = np.arange(len(projects))

    bars = ax.barh(y_pos, gains, color=colors, edgecolor="white", height=0.6)

    # 标注数值
    for i, (bar, gain, lbl) in enumerate(zip(bars, gains, labels)):
        if colors[i] == "#CCCCCC":
            ax.text(0, bar.get_y() + bar.get_height() / 2, "N/A",
                    ha="center", va="center", fontsize=10, color="#999", fontstyle="italic")
        else:
            ax.text(bar.get_width() + (0.5 if bar.get_width() >= 0 else -1.5),
                    bar.get_y() + bar.get_height() / 2,
                    f"{gain:+.1f}%p", va="center",
                    fontsize=10, fontweight="bold",
                    color=colors[i])

    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels)

    # 参考线
    ax.axvline(x=0, color="black", linewidth=0.8)
    ax.axvline(x=TARGET_COVERAGE_GAIN, color="red", linestyle="--",
               linewidth=1.5, alpha=0.7, label=f"目标 +{TARGET_COVERAGE_GAIN:.0f}%p")

    # 平均线
    valid_gains = [g for g in gains if g != 0 or colors[gains.index(g)] != "#CCCCCC"]
    if valid_gains:
        mean_gain = np.mean(valid_gains)
        ax.axvline(x=mean_gain, color="blue", linestyle="-", linewidth=1.2, alpha=0.5,
                   label=f"平均 {mean_gain:+.1f}%p")

    ax.set_xlabel("语句覆盖率提升 (百分点)")
    ax.set_title("覆盖提升汇总 (Enhanced Guided vs Greedy DFS)", fontsize=14, fontweight="bold")
    ax.legend(fontsize=9, loc="lower right")
    ax.invert_yaxis()

    fig.tight_layout()

    outpath = os.path.join(output_dir, "coverage_gain.png")
    fig.savefig(outpath)
    plt.close(fig)
    print(f"  [OK] {outpath}")

# ---------------------------------------------------------------------------
# Chart 6: 综合雷达图
# ---------------------------------------------------------------------------

def chart6_radar_overview(df_agg: pd.DataFrame, output_dir: str) -> None:
    """每项目一个雷达子图，5 维归一化对比。"""
    projects = sorted(df_agg["project"].unique())
    if not projects:
        print("  [跳过] Chart 6: 无项目数据")
        return

    dimensions = ["语句覆盖", "分支覆盖", "探索效率", "PTG覆盖", "检测率"]
    n_dims = len(dimensions)

    # 收集所有原始值以计算全局 max
    raw = {p: {} for p in projects}
    all_edges = []
    for proj in projects:
        for pol in ["greedy_dfs", "enhanced_guided"]:
            row = df_agg[(df_agg["project"] == proj) & (df_agg["policy"] == pol)]
            if len(row) > 0:
                r = row.iloc[0]
                raw[proj][pol] = {
                    "cov_statement": float(r["cov_statement"]),
                    "cov_branch": float(r["cov_branch"]),
                    "events_per_cov_pct": float(r["events_per_cov_pct"]),
                    "ptg_edges": float(r["ptg_edges"]),
                    "crashes_per_1000ev": float(r["crashes_per_1000ev"]),
                }
                all_edges.append(float(r["ptg_edges"]))
    max_edges = max(all_edges) if all_edges else 1

    def normalize(d: dict) -> list:
        vals = []
        # 语句覆盖
        v = d.get("cov_statement", NA_VALUE)
        vals.append(v / 100 if is_valid(v) else 0)
        # 分支覆盖
        v = d.get("cov_branch", NA_VALUE)
        vals.append(v / 100 if is_valid(v) else 0)
        # 探索效率
        v = d.get("events_per_cov_pct", NA_VALUE)
        vals.append(min(1.0, 100.0 / max(1.0, v)) if is_valid(v) and v > 0 else 0)
        # PTG覆盖
        v = d.get("ptg_edges", 0)
        vals.append(v / max_edges if max_edges > 0 else 0)
        # 检测率
        v = d.get("crashes_per_1000ev", 999)
        vals.append(max(0, min(1.0, 1.0 - v / 1000.0)) if is_valid(v) else 0.5)
        return vals

    # 布局
    cols = min(3, len(projects))
    rows = math.ceil(len(projects) / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(5 * cols, 5 * rows),
                              subplot_kw={"projection": "polar"})
    if len(projects) == 1:
        axes = np.array([[axes]])
    elif rows == 1:
        axes = axes.reshape(1, -1)
    elif cols == 1:
        axes = axes.reshape(-1, 1)

    angles = [n / n_dims * 2 * math.pi for n in range(n_dims)]
    angles += angles[:1]  # close polygon

    for idx, proj in enumerate(projects):
        r_idx, c_idx = divmod(idx, cols)
        ax = axes[r_idx, c_idx]

        for pol, color_key in [("greedy_dfs", "greedy_dfs"),
                                ("enhanced_guided", "enhanced_guided")]:
            if pol in raw[proj]:
                norm_vals = normalize(raw[proj][pol])
                plot_vals = norm_vals + norm_vals[:1]
                color = POLICY_COLORS[color_key]
                label = pol.replace("_", " ").title()
                ax.plot(angles, plot_vals, "o-", color=color, linewidth=2, label=label)
                ax.fill(angles, plot_vals, color=color, alpha=0.1)

        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(dimensions, fontsize=9)
        ax.set_ylim(0, 1.05)
        ax.set_yticks([0.2, 0.4, 0.6, 0.8, 1.0])
        ax.set_yticklabels(["20%", "40%", "60%", "80%", "100%"], fontsize=7)
        ax.set_title(short_name(proj), fontsize=12, fontweight="bold", pad=20)

    # 隐藏多余子图
    for idx in range(len(projects), rows * cols):
        r_idx, c_idx = divmod(idx, cols)
        axes[r_idx, c_idx].set_visible(False)

    # 共享图例
    handles, labels_legend = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, labels_legend, loc="lower center", ncol=2, fontsize=10,
               bbox_to_anchor=(0.5, -0.02))
    fig.suptitle("综合雷达对比 (Enhanced Guided vs Greedy DFS)", fontsize=14, fontweight="bold",
                 y=1.01)

    fig.tight_layout()

    outpath = os.path.join(output_dir, "radar_overview.png")
    fig.savefig(outpath)
    plt.close(fig)
    print(f"  [OK] {outpath}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="HapTest 实验数据可视化 — 从 CSV 生成对比图表",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例:\n  python visualize_results.py results.csv\n"
               "  python visualize_results.py results.csv -o charts/ --dpi 300\n"
               "  python visualize_results.py results.csv --policies greedy_dfs,enhanced_guided",
    )
    parser.add_argument("csv_path", help="results.csv 文件路径 (collect_results.js 输出)")
    parser.add_argument("-o", "--output", default="./charts/", help="输出目录 (默认 ./charts/)")
    parser.add_argument("--dpi", type=int, default=200, help="输出图片 DPI (默认 200)")
    parser.add_argument("--policies", default="greedy_dfs,enhanced_guided",
                        help="对比的策略名称，逗号分隔 (默认 greedy_dfs,enhanced_guided)")
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 60)
    print("HapTest 实验数据可视化")
    print(f"  CSV: {args.csv_path}")
    print(f"  输出: {args.output}")
    print(f"  DPI: {args.dpi}")
    print("=" * 60)

    setup_matplotlib()
    plt.rcParams["savefig.dpi"] = args.dpi

    # 读取 + 聚合
    print("\n[1] 读取数据...")
    df = parse_csv(args.csv_path)
    print(f"    原始行数: {len(df)}")
    print(f"    策略: {sorted(df['policy'].dropna().unique())}")
    print(f"    项目: {sorted(df['project'].dropna().unique())}")

    df_agg = aggregate_experiments(df)
    print(f"    聚合后行数: {len(df_agg)}")

    # 过滤策略
    target_policies = [p.strip() for p in args.policies.split(",") if p.strip()]
    df_agg = df_agg[df_agg["policy"].isin(target_policies)]
    if len(df_agg) == 0:
        print(f"[错误] 过滤后无数据 (策略: {target_policies})")
        sys.exit(1)

    # 创建输出目录
    os.makedirs(args.output, exist_ok=True)

    # 生成图表
    print("\n[2] 生成图表...")
    chart1_coverage_comparison(df_agg, args.output)
    chart2_efficiency(df_agg, args.output)
    chart3_ptg_comparison(df_agg, args.output)
    chart4_crash_comparison(df_agg, args.output)
    chart5_coverage_gain(df_agg, args.output)
    chart6_radar_overview(df_agg, args.output)

    print(f"\n  6 张图表已保存至: {os.path.abspath(args.output)}")


if __name__ == "__main__":
    main()

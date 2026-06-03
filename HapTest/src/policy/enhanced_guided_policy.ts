import path from "path";
import * as fs from "fs";
import { Device } from "../device/device";
import { Event } from "../event/event";
import { Hap } from "../model/hap";
import { PolicyName } from "./policy";
import { StaticGuidedPolicy } from "./static_guided_policy";
import { EventBuilder } from "../event/event_builder";
import { RandomUtils } from "../utils/random_utils";
import { Component } from "../model/component";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrioritizedEvent {
    event: Event;
    /** 越小优先级越高: 0=新页面导航 1=onClick/onTouch 2=onLongClick 3=Scroll/Change 4=Back 5=被动 */
    priority: number;
    node: any;
}

// ---------------------------------------------------------------------------
// EnhancedGuidedPolicy
// ---------------------------------------------------------------------------

/**
 * 增强型静态引导策略 — 深度集成 ArkAnalyzer 输出。
 *
 * 相比 StaticGuidedPolicy 的增强点:
 *   1. 事件类型扩展 — onClick/onTouch 之外支持 LongClick/Scroll/InputText/Back
 *   2. 优先级排序 — 新页面导航 > 主交互 > 次级交互 > 导航键 > 被动事件
 *   3. 页面访问追踪 — 优先选择通往未访问页面的导航事件
 *   4. 已访问页面均衡 — 同优先级内随机打乱，避免重复点击同一组件
 */
export class EnhancedGuidedPolicy extends StaticGuidedPolicy {
    private hasConfig: boolean;
    private visitedPages: Set<string> = new Set();
    private currentPageId: string = "";
    private staticInventory: Array<{ type: string; callbacks: string[] }> = [];

    constructor(device: Device, hap: Hap, name: PolicyName, config?: string) {
        super(device, hap, name, config || "");
        this.hasConfig = !!config;
        this.logger.info(
            `[EnhancedGuided] 初始化 | mode=${this.hasConfig ? "full" : "skeleton"} | config=${config || "(none)"}`,
        );

        // 尝试加载静态回调清单
        if (this.hasConfig) {
            const invPath = this.config.replace(".json", "_inventory.json");
            if (fs.existsSync(invPath)) {
                try {
                    this.staticInventory = JSON.parse(fs.readFileSync(invPath, "utf-8"));
                    this.logger.info(
                        `[EnhancedGuided] 加载静态回调清单: ${this.staticInventory.length} 种组件类型`,
                    );
                } catch (e) {
                    this.logger.warn(`[EnhancedGuided] 静态回调清单解析失败: ${e}`);
                }
            } else {
                this.logger.warn(
                    `[EnhancedGuided] 静态回调清单不存在: ${invPath}，请先运行 static_inventory.js`,
                );
            }
        }
    }

    // -----------------------------------------------------------------------
    // 覆盖: generateEventBasedOnPtg
    // -----------------------------------------------------------------------

    generateEventBasedOnPtg(): Event {
        // 骨架模式 — 无 ArkAnalyzer 配置时降级
        if (!this.hasConfig) {
            this.logger.info("[EnhancedGuided] 骨架模式 — 随机事件");
            return EventBuilder.createRandomTouchEvent(this.device);
        }

        // 完全委托父类管线 (dumpLayout → exec arkuianalyzer.js → generateEventBasedOnStaticJsonFile)
        // 父类的 generateEventBasedOnStaticJsonFile 已被本类覆盖为增强版
        return super.generateEventBasedOnPtg();
    }

    // -----------------------------------------------------------------------
    // 核心覆盖: 增强版 JSON 解析 + 事件优先级排序
    // -----------------------------------------------------------------------

    protected generateEventBasedOnStaticJsonFile(jsonfile: string): Event | undefined {
        const collected: PrioritizedEvent[] = [];

        try {
            const file = jsonfile.replace(".json", "_guided.json");
            const filePath = path.resolve(__dirname, this.outputDir, file);
            this.logger.info(`[EnhancedGuided] 读取 guided JSON: ${filePath}`);

            const content = fs.readFileSync(filePath, "utf-8");
            const jsonData = JSON.parse(content);

            // 追踪当前页面
            if (jsonData.pageInfo?.pgaePath) {
                this.currentPageId = jsonData.pageInfo.pgaePath;
                this.visitedPages.add(this.currentPageId);
            }

            // 解析所有 edges → 分类 + 评分
            for (const edge of jsonData.edges || []) {
                const toPage = edge.to || "";
                const isNewPageNav =
                    this.isPageTransitionEdge(edge) &&
                    toPage.length > 0 &&
                    !this.visitedPages.has(toPage);

                for (const node of edge.nodes || []) {
                    const event = EventBuilder.createEnhancedEventFromNode(node);
                    if (!event) continue;

                    const priority = this.rankPriority(node, isNewPageNav);
                    collected.push({ event, priority, node });
                }
            }

            // 清理临时文件
            fs.unlinkSync(filePath);
            this.logger.info(`[EnhancedGuided] 已删除临时文件: ${filePath}`);

            if (collected.length === 0) {
                this.logger.warn("[EnhancedGuided] xpath 匹配无事件，尝试类型匹配降级");
                return this.generateEventByTypeMatching();
            }

            // 按优先级排序 → 同优先级内随机打乱（均衡探索）
            const selected = this.selectBest(collected);
            const cb = selected.node.call_back_method || "unknown";

            this.logger.info(
                `[EnhancedGuided] 选中事件 priority=${selected.priority} callback=${cb} ` +
                `totalCandidates=${collected.length}`,
            );

            return selected.event;
        } catch (error) {
            this.logger.error(`[EnhancedGuided] guided JSON 解析失败: ${error}`);
            return undefined;
        }
    }

    // -----------------------------------------------------------------------
    // 优先级评分
    // -----------------------------------------------------------------------

    private rankPriority(node: any, isNewPageNav: boolean): number {
        if (isNewPageNav) return 0; // 最高: 导航到未访问页面

        const cb: string = (node.call_back_method || "").toLowerCase();

        if (cb.includes("onclick") || cb.includes("ontouch")) return 1;
        if (cb.includes("onlongclick")) return 2;
        if (cb.includes("onscroll") || cb.includes("onchange") || cb.includes("onsubmit")) return 3;
        if (cb.includes("onbackpressed")) return 4;
        return 5; // onAppear/onDisappear/onShown 等被动事件 — 不优先
    }

    // -----------------------------------------------------------------------
    // 事件选择: 最小优先级 + 同优先级内随机
    // -----------------------------------------------------------------------

    private selectBest(candidates: PrioritizedEvent[]): PrioritizedEvent {
        // 稳定排序: 按 priority 升序
        candidates.sort((a, b) => a.priority - b.priority);

        // 取最高优先级组（priority 最小的）
        const bestPriority = candidates[0].priority;
        const topGroup = candidates.filter((c) => c.priority === bestPriority);

        // 同优先级内随机打乱，均衡探索
        const idx = RandomUtils.genRandomNum(0, topGroup.length - 1);
        return topGroup[idx];
    }

    // -----------------------------------------------------------------------
    // 类型匹配降级: 运行时组件按 type 匹配静态回调清单
    // -----------------------------------------------------------------------

    private generateEventByTypeMatching(): Event | undefined {
        if (this.staticInventory.length === 0) {
            this.logger.warn("[EnhancedGuided] 无静态回调清单，无法降级");
            return undefined;
        }

        const components = this.currentPage?.getComponents() || [];
        const candidates: PrioritizedEvent[] = [];

        for (const comp of components) {
            if (!comp.hasUIEvent()) continue;
            const event = EventBuilder.createEventFromInventory(comp, this.staticInventory);
            if (!event) continue;

            const priority = this.rankPriorityByComponent(comp);
            candidates.push({
                event,
                priority,
                node: { call_back_method: comp.type || "unknown" },
            });
        }

        if (candidates.length === 0) {
            this.logger.warn("[EnhancedGuided] 类型匹配无可用事件");
            return undefined;
        }

        const selected = this.selectBest(candidates);
        this.logger.info(
            `[EnhancedGuided] 类型匹配选中 type=${selected.node.call_back_method} ` +
            `priority=${selected.priority} totalCandidates=${candidates.length}`,
        );
        return selected.event;
    }

    /** 根据运行时组件能力评估优先级 */
    private rankPriorityByComponent(comp: Component): number {
        // 可输入组件（TextInput 等）
        if (comp.inputable) return 3;
        // 可滚动组件（List, Scroll 等）
        if (comp.scrollable) return 3;
        // 可长按组件
        if (comp.longClickable) return 2;
        // 可点击组件（最通用）
        if (comp.clickable || comp.checkable) return 1;
        return 4;
    }

    // -----------------------------------------------------------------------
    // 辅助: 判断边是否为页面跳转
    // -----------------------------------------------------------------------

    private isPageTransitionEdge(edge: any): boolean {
        const from = edge.from || "";
        const to = edge.to || "";
        if (!from || !to || from === to) return false;

        // 检查 event 数组中是否有页面入栈/出栈标记
        for (const ev of edge.event || []) {
            const et = ev.eventType || "";
            if (et.includes("页面入栈") || et.includes("页面出栈") || et.includes("navigation")) {
                return true;
            }
        }

        // 备选: from/to 页面不同且 from 的 pageId ≠ to 的 pageId
        const fromPage = from.split(";")[0] || "";
        const toPage = to.split(";")[0] || "";
        return fromPage !== toPage;
    }
}

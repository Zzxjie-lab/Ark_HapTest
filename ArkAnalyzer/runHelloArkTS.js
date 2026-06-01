const path = require('path');
const fs = require('fs');

// 加载 ArkAnalyzer (使用已编译的 out 目录)
const aa = require('./out/src/index.js');

const PROJECT_DIR = path.resolve('E:/OpenHarmony/Projects/HelloArkTS');
const OUTPUT_DIR = path.resolve('./output/HelloArkTS_analysis');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function main() {
    console.log('=== ArkAnalyzer 分析 HelloArkTS ===');
    console.log('项目目录:', PROJECT_DIR);
    console.log('输出目录:', OUTPUT_DIR);

    // Step 1: 构建 SceneConfig
    console.log('\n[1/5] 构建SceneConfig...');
    const config = new aa.SceneConfig();
    config.buildFromProjectDir(PROJECT_DIR);
    const fileCount = config.getProjectFiles().length;
    console.log('  找到', fileCount, '个源文件');
    config.getProjectFiles().forEach(f => console.log('    -', path.relative(PROJECT_DIR, f)));

    // Step 2: 构建 Scene
    console.log('\n[2/5] 构建Scene...');
    const scene = new aa.Scene();
    scene.buildBasicInfo(config);

    const buildProfilePath = path.join(PROJECT_DIR, 'build-profile.json5');
    if (fs.existsSync(buildProfilePath)) {
        console.log('  检测到build-profile.json5，使用HarmonyOS模块构建模式');
        scene.buildScene4HarmonyProject();
    } else {
        console.log('  使用简单项目构建模式');
        scene.buildSceneFromProjectDir(config);
    }

    // Step 3: 类型推断
    console.log('\n[3/5] 类型推断...');
    scene.inferTypes();

    // Step 4: 收集类和方法
    console.log('\n[4/5] 收集类、方法、调用图、CFG...');

    const classes = scene.getClasses();
    const methods = scene.getMethods();

    // 过滤内部生成的类/方法 (名称以 % 开头)
    const realClasses = classes.filter(c => !c.getName().startsWith('%'));
    const realMethods = methods.filter(m => !m.getName().startsWith('%'));

    // ========== 1. 类列表 ==========
    console.log('\n========== 类列表 (' + realClasses.length + '个) ==========');
    const classList = [];
    for (const cls of realClasses) {
        const sig = cls.getSignature();
        const fileSig = sig.getDeclaringFileSignature();
        const info = {
            name: cls.getName(),
            file: fileSig.getFileName(),
            methodCount: cls.getMethods().filter(m => !m.getName().startsWith('%')).length,
            methods: cls.getMethods().filter(m => !m.getName().startsWith('%')).map(m => ({
                name: m.getName(),
                line: m.getLine(),
                column: m.getColumn(),
                paramCount: m.getParameters().length,
                returnType: m.getReturnType()?.constructor?.name || 'unknown',
                code: m.getCode() ? m.getCode().substring(0, 200) : '(无代码/声明)',
            })),
        };
        classList.push(info);
        console.log(`  [${info.file}] class ${info.name} (${info.methodCount}个方法)`);
        for (const m of info.methods) {
            console.log(`    - ${m.name}() :${m.line}:${m.column} [${m.paramCount}个参数]`);
        }
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'classes.json'), JSON.stringify(classList, null, 2));

    // ========== 2. 方法列表 ==========
    console.log('\n========== 方法列表 (' + realMethods.length + '个) ==========');
    const methodList = [];
    for (const m of realMethods) {
        const sig = m.getSignature();
        const classSig = sig.getDeclaringClassSignature();
        const fileSig = classSig.getDeclaringFileSignature();
        const info = {
            name: m.getName(),
            fullSignature: sig.toString(),
            className: classSig.getClassName(),
            file: fileSig.getFileName(),
            project: fileSig.getProjectName(),
            line: m.getLine(),
            column: m.getColumn(),
            paramCount: m.getParameters().length,
            isConstructor: m.getName() === 'constructor',
            hasBody: m.getBody() !== undefined,
            hasCfg: m.getCfg() !== undefined,
            code: m.getCode() ? m.getCode().substring(0, 200) : '(无代码/声明)',
        };
        methodList.push(info);
        const cfgStatus = info.hasCfg ? ' [CFG:' + m.getCfg().getBlocks().size + '块]' : '';
        console.log(`  [${info.className}] ${info.name}() @${info.file}:${info.line}${cfgStatus}`);
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'methods.json'), JSON.stringify(methodList, null, 2));

    // ========== 3. 调用图 (Call Graph) ==========
    console.log('\n========== 调用图 ==========');
    // 排除 $ 开头的内部方法
    const entryMethods = realMethods.filter(m => {
        const clsName = m.getSignature().getDeclaringClassSignature().getClassName();
        return !clsName.startsWith('%');
    });
    const entryPoints = entryMethods.map(m => m.getSignature());

    if (entryPoints.length > 0) {
        const callGraph = scene.makeCallGraphCHA(entryPoints);
        const cgPath = path.join(OUTPUT_DIR, 'callgraph.dot');
        callGraph.dump(cgPath);
        console.log('  调用图已保存:', cgPath);
        console.log('  入口方法数:', entryPoints.length);

        // 也输出调用图的统计信息
        const statInfo = callGraph.getStat();
        console.log('  统计:', statInfo);

        // 额外输出调用关系JSON
        const edges = [];
        for (const node of callGraph.nodesItor()) {
            for (const edge of node.getOutgoingEdges()) {
                const srcNode = edge.getSrcNode();
                const dstNode = edge.getDstNode();
                edges.push({
                    caller: srcNode.getMethod().toString(),
                    callee: dstNode.getMethod().toString(),
                });
            }
        }
        fs.writeFileSync(path.join(OUTPUT_DIR, 'callgraph.json'), JSON.stringify(edges, null, 2));
        console.log('  调用关系JSON已保存:', path.join(OUTPUT_DIR, 'callgraph.json'));
    } else {
        console.log('  未找到合适的入口方法，跳过调用图构建');
    }

    // ========== 4. CFG (控制流图) ==========
    console.log('\n========== CFG (控制流图) ==========');
    const cfgOutputDir = path.join(OUTPUT_DIR, 'cfg');
    if (!fs.existsSync(cfgOutputDir)) {
        fs.mkdirSync(cfgOutputDir, { recursive: true });
    }

    // 同时输出一个 JSON 汇总
    const allCfgs = [];
    let cfgCount = 0;
    for (const m of realMethods) {
        const cfg = m.getCfg();
        if (cfg) {
            const blocks = [...cfg.getBlocks()];
            if (blocks.length > 0) {
                // 输出 DOT 格式
                const dotPrinter = new aa.DotMethodPrinter(m);
                const dotContent = dotPrinter.dump();
                const safeName = m.getSignature().toString()
                    .replace(/[<>:"/\\|?*]/g, '_')
                    .substring(0, 200);
                fs.writeFileSync(path.join(cfgOutputDir, safeName + '.dot'), dotContent);

                // 收集 JSON 信息
                const cfgBlocks = [];
                let blockIdx = 0;
                for (const block of blocks) {
                    const succIdxes = [];
                    for (const succ of block.getSuccessors()) {
                        const succBlocks = [...blocks];
                        const idx = succBlocks.indexOf(succ);
                        if (idx >= 0) succIdxes.push(idx);
                    }
                    cfgBlocks.push({
                        id: blockIdx,
                        stmts: block.getStmts().map(s => s.toString()),
                        successors: succIdxes,
                    });
                    blockIdx++;
                }

                allCfgs.push({
                    method: m.getSignature().toString(),
                    className: m.getSignature().getDeclaringClassSignature().getClassName(),
                    methodName: m.getName(),
                    line: m.getLine(),
                    blocks: cfgBlocks,
                });
                cfgCount++;
            }
        }
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'cfg.json'), JSON.stringify(allCfgs, null, 2));
    console.log(`  ${cfgCount}个CFG已保存 (DOT格式: cfg/*.dot, JSON汇总: cfg.json)`);

    // ========== 总结 ==========
    console.log('\n========================================');
    console.log('分析完成! 输出文件:');
    console.log('  类列表:    ', path.join(OUTPUT_DIR, 'classes.json'));
    console.log('  方法列表:  ', path.join(OUTPUT_DIR, 'methods.json'));
    console.log('  调用图DOT: ', path.join(OUTPUT_DIR, 'callgraph.dot'));
    console.log('  调用图JSON:', path.join(OUTPUT_DIR, 'callgraph.json'));
    console.log('  CFG汇总:   ', path.join(OUTPUT_DIR, 'cfg.json'));
    console.log('  CFG详细:   ', path.join(OUTPUT_DIR, 'cfg/') + '*.dot');
    console.log('========================================');
}

main();

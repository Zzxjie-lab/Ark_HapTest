const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.resolve('./output/HelloArkTS_analysis');
const OUTPUT_PATH = path.join(INPUT_DIR, 'sptg.json');

// 敏感API定义
const SENSITIVE_RULES = [
    { pattern: /hilog\.\w+/, api: 'hilog.*', category: 'logging' },
    { pattern: /JSON\.stringify/, api: 'JSON.stringify', category: 'data_serialization' },
    { pattern: /JSON\.parse/, api: 'JSON.parse', category: 'data_deserialization' },
    { pattern: /loadContent/, api: 'loadContent', category: 'content_loading' },
    { pattern: /setColorMode/, api: 'setColorMode', category: 'configuration' },
    { pattern: /\$r\(/, api: '$r()', category: 'resource_loading' },
    { pattern: /Promise\.resolve/, api: 'Promise.resolve', category: 'async_operation' },
];

function isInternalMethod(name) {
    return name.startsWith('%');
}

function matchSensitive(stmt) {
    for (const rule of SENSITIVE_RULES) {
        if (rule.pattern.test(stmt)) {
            return rule;
        }
    }
    return null;
}

function buildSptg() {
    console.log('=== 构建 SPTG ===');

    const cfgData = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'cfg.json'), 'utf-8'));
    const callgraphData = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'callgraph.json'), 'utf-8'));

    const nodes = [];
    const edges = [];
    let nodeIdx = 0;
    const methodNodeMap = {};   // methodSignature -> nodeId
    const sensitiveSet = new Set(); // 去重: api@category

    // ===== 1. 处理 method 节点 =====
    for (const m of cfgData) {
        if (isInternalMethod(m.className)) continue;

        const nodeId = `N${nodeIdx++}`;
        methodNodeMap[m.method] = nodeId;
        nodes.push({
            id: nodeId,
            type: 'method',
            name: m.methodName,
            fullSignature: m.method,
            className: m.className,
            file: m.method.split(':')[0].replace('@HelloArkTS/', ''),
            line: m.line,
        });
    }

    // ===== 2. 处理 branch 节点 + 收集 sensitive_api =====
    const branchNodes = [];
    const sensitiveNodes = [];
    const sensitiveMap = {}; // key -> nodeId

    for (const m of cfgData) {
        if (isInternalMethod(m.className)) continue;

        const methodNodeId = methodNodeMap[m.method];
        if (!methodNodeId) continue;

        // 先检测 try-catch: 有 caughtexception 的块
        const catchBlocks = m.blocks.filter(b => b.stmts.some(s => s.includes('caughtexception')));
        // 找到 catch 块对应的 try 块 (catch 块的前驱中不包含 caughtexception 的)
        const tryBlockIds = new Set();
        for (const cb of catchBlocks) {
            // 反向: 找到所有直接前驱块 (那些后继包含 catch 块的)
            for (const block of m.blocks) {
                if (block.successors.includes(cb.id) && !block.stmts.some(s => s.includes('caughtexception'))) {
                    tryBlockIds.add(block.id);
                }
            }
            // 也检查后继相同的非 catch 块 (同一个 join 点)
            if (cb.successors.length === 1) {
                const joinId = cb.successors[0];
                for (const block of m.blocks) {
                    if (block.id !== cb.id && block.successors.includes(joinId) &&
                        !block.stmts.some(s => s.includes('caughtexception')) &&
                        block.successors.length === 1) {
                        tryBlockIds.add(block.id);
                    }
                }
            }
        }

        for (const block of m.blocks) {
            // Branch 检测: 有 >1 个显式后继 或 是 try-catch 中的 try 块
            const isExplicitBranch = block.successors.length > 1;
            const isTryBlock = tryBlockIds.has(block.id);

            if (isExplicitBranch || isTryBlock) {
                const branchId = `N${nodeIdx++}`;
                const branchType = isTryBlock ? 'try-catch' : (block.successors.length > 1 ? 'if-else' : 'switch');
                const condStmt = block.stmts.find(s => s.includes('IfStmt') || s.includes('if '))
                    || (isTryBlock ? `try block → normal + exception` : block.stmts[0]);

                branchNodes.push({
                    id: branchId,
                    type: 'branch',
                    method: m.method,
                    methodNodeId: methodNodeId,
                    blockId: block.id,
                    branchType: branchType,
                    label: typeof condStmt === 'string' ? condStmt.substring(0, 80) : condStmt,
                });
                // control_flow: method → branch
                edges.push({ from: methodNodeId, to: branchId, type: 'control_flow', label: `via block${block.id}` });

                // control_flow: branch → successor blocks
                if (isTryBlock) {
                    // 找到对应的 catch 块
                    const relatedCatchBlocks = catchBlocks.filter(cb => {
                        // catch 和 try 到达同一个 join 点
                        return cb.successors.some(s => block.successors.includes(s));
                    });
                    for (const cb of relatedCatchBlocks) {
                        const catchLabel = cb.stmts.find(s => s.includes('caughtexception'))?.substring(0, 50) || 'catch exception';
                        edges.push({ from: branchId, to: methodNodeId, type: 'control_flow', label: `block${cb.id}: ${catchLabel}` });
                    }
                }
                for (const succId of block.successors) {
                    const succBlock = m.blocks.find(b => b.id === succId);
                    if (succBlock) {
                        const succLabel = succBlock.stmts[0]?.substring(0, 50) || '';
                        edges.push({ from: branchId, to: methodNodeId, type: 'control_flow', label: `block${succId}: ${succLabel}` });
                    }
                }
            }

            // Sensitive API: 扫描块中每条语句
            for (const stmt of block.stmts) {
                const match = matchSensitive(stmt);
                if (match) {
                    const key = `${match.api}|${match.category}`;
                    if (!sensitiveMap[key]) {
                        const sid = `N${nodeIdx++}`;
                        sensitiveMap[key] = sid;
                        sensitiveNodes.push({
                            id: sid,
                            type: 'sensitive_api',
                            api: match.api,
                            category: match.category,
                        });
                    }
                    // control_flow: method → sensitive_api (only once per method+key combo)
                    const edgeKey = `${methodNodeId}->${sensitiveMap[key]}`;
                    if (!sensitiveSet.has(edgeKey)) {
                        sensitiveSet.add(edgeKey);
                        edges.push({ from: methodNodeId, to: sensitiveMap[key], type: 'control_flow', label: `block${block.id}` });
                    }
                }
            }
        }
    }

    nodes.push(...branchNodes);
    nodes.push(...sensitiveNodes);

    // ===== 3. call 边 (从 callgraph) =====
    const callEdgesAdded = new Set();
    for (const cg of callgraphData) {
        const fromId = methodNodeMap[cg.caller];
        const toId = methodNodeMap[cg.callee];

        if (fromId && toId) {
            const ek = `${fromId}->${toId}`;
            if (!callEdgesAdded.has(ek)) {
                callEdgesAdded.add(ek);
                // 尝试解析 callee 名
                const calleeName = cg.callee.split(':')[1]?.trim() || cg.callee;
                edges.push({ from: fromId, to: toId, type: 'call', label: calleeName });
            }
        } else if (fromId && !toId) {
            // callee 是内部方法(匿名lambda等): 用 method 节点指代，创建简化的 edge
            const calleeShort = cg.callee.split(':').pop()?.trim() || 'anonymous';
            const ek = `${fromId}->${cg.callee}`;
            if (!callEdgesAdded.has(ek)) {
                callEdgesAdded.add(ek);
                edges.push({ from: fromId, to: cg.callee, type: 'call', label: calleeShort, note: 'internal/anon' });
            }
        }
    }

    // ===== 4. 统计 =====
    const methodCount = nodes.filter(n => n.type === 'method').length;
    const branchCount = nodes.filter(n => n.type === 'branch').length;
    const sensitiveCount = nodes.filter(n => n.type === 'sensitive_api').length;
    const totalNodes = nodes.length;
    const callEdgeCount = edges.filter(e => e.type === 'call').length;
    const cfEdgeCount = edges.filter(e => e.type === 'control_flow').length;
    const totalEdges = edges.length;

    const sptg = {
        meta: {
            description: 'SPTG - Security Policy Test Graph',
            generatedFrom: ['callgraph.json', 'cfg.json'],
            statistics: {
                totalNodes,
                methodNodes: methodCount,
                branchNodes: branchCount,
                sensitiveApiNodes: sensitiveCount,
                totalEdges,
                callEdges: callEdgeCount,
                controlFlowEdges: cfEdgeCount,
            },
        },
        nodes,
        edges,
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sptg, null, 2));
    console.log(`SPTG 已保存: ${OUTPUT_PATH}`);

    // 输出统计
    console.log('\n========== SPTG 统计 ==========');
    console.log(`节点总数:      ${totalNodes}`);
    console.log(`  - method:        ${methodCount}`);
    console.log(`  - branch:        ${branchCount}`);
    console.log(`  - sensitive_api: ${sensitiveCount}`);
    console.log(`边总数:        ${totalEdges}`);
    console.log(`  - call:          ${callEdgeCount}`);
    console.log(`  - control_flow:  ${cfEdgeCount}`);

    // 详细列表
    console.log('\n--- method 节点 ---');
    nodes.filter(n => n.type === 'method').forEach(n => {
        console.log(`  ${n.id}: ${n.className}.${n.name}() [${n.file}:${n.line}]`);
    });

    if (branchCount > 0) {
        console.log('\n--- branch 节点 ---');
        branchNodes.forEach(n => {
            console.log(`  ${n.id}: block#${n.blockId} in ${n.method.split(':').pop()} — ${n.label}`);
        });
    }

    if (sensitiveCount > 0) {
        console.log('\n--- sensitive_api 节点 ---');
        sensitiveNodes.forEach(n => {
            console.log(`  ${n.id}: ${n.api} [${n.category}]`);
        });
    }

    console.log(`\n========== 完成 ==========`);
}

buildSptg();

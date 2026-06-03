const { ModelUtils, Scene, SceneConfig } = require('./bundle.js');
const fs = require('fs');
const path = require('path');

// 用户可交互的回调（排除生命周期类）
const ACTIVE_CALLBACKS = new Set([
    'onClick', 'onTouch', 'onLongClick',
    'onScroll', 'onScrollStart', 'onScrollStop',
    'onReachStart', 'onReachEnd', 'onScrollIndex',
    'onChange', 'onSubmit', 'onEditChange', 'onTextSelectionChange',
    'onBackPressed',
]);

function extractInventory(configPath) {
    const finalConfigPath = path.resolve(configPath);
    if (!fs.existsSync(finalConfigPath)) {
        console.error(`[错误] 配置文件不存在：${finalConfigPath}`);
        process.exit(1);
    }
    console.log(`使用配置文件: ${finalConfigPath}`);

    const sceneConfig = new SceneConfig();
    sceneConfig.buildFromJson(finalConfigPath);

    const scene = new Scene();
    scene.buildBasicInfo(sceneConfig);
    scene.buildScene4HarmonyProject();
    scene.inferTypes();

    console.log('=== Scene Build Complete ===');
    for (const arkFile of scene.getFiles()) {
        console.log('File:', arkFile.getName());
    }

    const inventory = new Map(); // type -> Set<callback>

    for (const arkFile of scene.getFiles()) {
        for (const arkClass of ModelUtils.getAllClassesInFile(arkFile)) {
            const viewTree = arkClass.getArkUIViewTree();
            if (!viewTree) continue;
            const root = viewTree.getRoot();
            if (!root) continue;

            walkNode(root, inventory);
        }
    }

    // 转为数组
    const result = [];
    for (const [type, callbacks] of inventory) {
        result.push({ type, callbacks: [...callbacks].sort() });
    }
    result.sort((a, b) => a.type.localeCompare(b.type));

    return result;
}

function walkNode(node, inventory) {
    const callbacks = [];
    for (const [key] of node.attributes) {
        if (ACTIVE_CALLBACKS.has(key)) {
            callbacks.push(key);
        }
    }

    if (callbacks.length > 0) {
        if (!inventory.has(node.name)) {
            inventory.set(node.name, new Set());
        }
        for (const cb of callbacks) {
            inventory.get(node.name).add(cb);
        }
    }

    for (const child of node.children) {
        walkNode(child, inventory);
    }
}

// Main
const configPath = process.argv[2];
if (!configPath) {
    console.error('用法：node static_inventory.js <configPath>');
    process.exit(1);
}

const inventory = extractInventory(configPath);
const outPath = configPath.replace('.json', '_inventory.json');
fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2), 'utf-8');
console.log(`\n静态回调清单已写入: ${outPath}`);
console.log(JSON.stringify(inventory, null, 2));

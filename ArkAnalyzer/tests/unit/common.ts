/*
 * Copyright (c) 2024 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BasicBlock, DEFAULT_ARK_CLASS_NAME, DEFAULT_ARK_METHOD_NAME, ModelUtils, Scene, Stmt } from '../../src';
import { assert, expect } from 'vitest';

export function testFileStmts(scene: Scene, filePath: string, expectFileStmts: any): void {
    const arkFile = scene.getFiles().find((file) => file.getName().endsWith(filePath));
    if (!arkFile) {
        assert.isDefined(arkFile);
        return;
    }
    const methods = ModelUtils.getAllMethodsInFile(arkFile);
    for (const expectMethod of expectFileStmts.methods) {
        const expectMethodName = expectMethod.name;
        const method = methods.find((method) => method.getName() === expectMethodName);
        if (!method) {
            assert.isDefined(method);
            continue;
        }
        const stmts = method.getCfg()?.getStmts();
        if (!stmts) {
            assert.isDefined(stmts);
            continue;
        }
        assertStmtsEqual(stmts, expectMethod.stmts);
    }
}

export function testMethodStmts(scene: Scene, fileName: string, expectStmts: any[],
                                className: string = DEFAULT_ARK_CLASS_NAME,
                                methodName: string = DEFAULT_ARK_METHOD_NAME): void {
    const arkFile = scene.getFiles().find((file) => file.getName().endsWith(fileName));
    const arkMethod = arkFile?.getClassWithName(className)?.getMethods()
        .find((method) => (method.getName() === methodName));
    const stmts = arkMethod?.getCfg()?.getStmts();
    if (!stmts) {
        assert.isDefined(stmts);
        return;
    }
    assertStmtsEqual(stmts, expectStmts);
}

export function assertBlocksEqual(blocks: Set<BasicBlock>, expectBlocks: any[]): void {
    expect(blocks.size).toEqual(expectBlocks.length);

    const blockMap = new Map<number, BasicBlock>();
    for (const block of blocks) {
        blockMap.set(block.getId(), block);
    }
    for (let i = 0; i < expectBlocks.length; i++) {
        const blockId = expectBlocks[i].id;
        const block = blockMap.get(blockId);
        if (!block) {
            assert.isDefined(block);
            return;
        }

        const stmts: string[] = [];
        for (const stmt of block.getStmts()) {
            stmts.push(stmt.toString());
        }
        expect(stmts).toEqual(expectBlocks[i].stmts);

        const preds: number[] = [];
        block.getPredecessors().forEach(predBlock => {
            preds.push(predBlock.getId());
        });
        expect(preds).toEqual(expectBlocks[i].preds);

        const succes: number[] = [];
        block.getSuccessors().forEach(succBlock => {
            succes.push(succBlock.getId());
        });
        expect(succes).toEqual(expectBlocks[i].succes);
    }
}

export function assertStmtsEqual(stmts: Stmt[], expectStmts: any[]): void {
    expect(stmts.length).toEqual(expectStmts.length);
    for (let i = 0; i < stmts.length; i++) {
        expect(stmts[i].toString()).toEqual(expectStmts[i].text);

        if (expectStmts[i].operandOriginalPositions === undefined) {
            continue;
        }
        const operandOriginalPositions: any[] = [];
        for (const operand of stmts[i].getDefAndUses()) {
            const operandOriginalPosition = stmts[i].getOperandOriginalPosition(operand);
            if (operandOriginalPosition) {
                operandOriginalPositions.push(
                    [operandOriginalPosition.getFirstLine(), operandOriginalPosition.getFirstCol(),
                        operandOriginalPosition.getLastLine(), operandOriginalPosition.getLastCol()]);
            } else {
                operandOriginalPositions.push(operandOriginalPosition);
            }
        }
        expect(operandOriginalPositions).toEqual(expectStmts[i].operandOriginalPositions);
    }
}
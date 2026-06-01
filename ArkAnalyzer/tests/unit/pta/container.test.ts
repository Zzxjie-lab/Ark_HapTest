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

import { describe, it } from 'vitest';
import { SceneConfig, Scene, CallGraph, CallGraphBuilder, Pag, PointerAnalysis, PointerAnalysisConfig } from '../../../src';
import { Sdk } from '../../../src/Config';
import { assert } from 'vitest';

let sdk: Sdk = {
    name: 'ohos',
    path: './builtIn/typescript',
    moduleName: ''
};

describe('ContainerAddTest', () => {
    let config: SceneConfig = new SceneConfig();
    config.buildFromProjectDir('./tests/resources/pta/Container');
    config.getSdksObj().push(sdk);
    let scene = new Scene();
    scene.buildSceneFromProjectDir(config);
    scene.inferTypes();

    let cg = new CallGraph(scene);
    let cgBuilder = new CallGraphBuilder(cg, scene);
    cgBuilder.buildDirectCallGraphForScene();

    let pag = new Pag();
    let debugfunc = cg.getEntries().filter(funcID => cg.getArkMethodByFuncID(funcID)?.getName() === 'main');

    let ptaConfig = new PointerAnalysisConfig(2, './out', true, true);
    let pta = new PointerAnalysis(pag, cg, scene, ptaConfig);
    pta.setEntries(debugfunc);
    pta.start();

    let setMethod = scene.getClasses().filter(arkClass => arkClass.getName() === 'SetTest')
    .flatMap(arkClass => arkClass.getMethodWithName('test'))!;
    let mapMethod = scene.getClasses().filter(arkClass => arkClass.getName() === 'MapTest')
    .flatMap(arkClass => arkClass.getMethodWithName('test'))!;

    it('case1: Set.add(<T>)', () => {
        let setLocal = setMethod[0]?.getBody()?.getLocals().get('ele')!;
        let relatedNodes = pta.getRelatedNodes(setLocal);
        assert(
            Array.from(relatedNodes).some(element => element.toString() === 'set.<@container/lib.es2015.collection.d.ts: container.field>')
        );
    });

    it('case1: Map.set(K, V))', () => {
        let mapLocal = mapMethod[0]?.getBody()?.getLocals().get('ele')!;
        let relatedNodes = pta.getRelatedNodes(mapLocal);
        assert(
            Array.from(relatedNodes).some(element => element.toString() === 'map.<@container/lib.es2015.collection.d.ts: container.field>')
        );
    });
});
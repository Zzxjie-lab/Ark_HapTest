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

import { ArkFile } from '../model/ArkFile';
import { ArkExport } from '../model/ArkExport';
import { API_COMMON, API_INTERNAL, COMPONENT_ATTRIBUTE, COMPONENT_INSTANCE, COMPONENT_PATH } from './EtsConst';
import { THIS_NAME } from './TSConst';
import { TEMP_LOCAL_PREFIX } from './Const';
import { ArkClass, ClassCategory } from '../model/ArkClass';
import { LocalSignature } from '../model/ArkSignature';
import { ModelUtils } from './ModelUtils';
import { Local } from '../base/Local';
import { ArkMethod } from '../model/ArkMethod';

export class SdkUtils {

    public static buildGlobalMap(file: ArkFile, globalMap: Map<string, ArkExport>): void {
        const isGlobalPath = file.getFilePath().includes(COMPONENT_PATH) ||
            file.getFilePath().includes(API_INTERNAL) || file.getFilePath().includes(API_COMMON);
        if (!isGlobalPath) {
            return;
        }

        ModelUtils.getAllClassesInFile(file).forEach(cls => {
            if (!cls.isAnonymousClass() && !cls.isDefaultArkClass()) {
                SdkUtils.loadClass(globalMap, cls);
            }
            if (cls.isDefaultArkClass()) {
                cls.getMethods()
                    .filter(mtd => !mtd.isDefaultArkMethod() && !mtd.isAnonymousMethod())
                    .forEach(mtd => globalMap.set(mtd.getName(), mtd));
            }
        });
        const defaultArkMethod = file.getDefaultClass().getDefaultArkMethod();
        defaultArkMethod?.getBody()?.getLocals().forEach(local => {
            const name = local.getName();
            if (name !== THIS_NAME && !name.startsWith(TEMP_LOCAL_PREFIX) && !name.endsWith(COMPONENT_INSTANCE)) {
                this.loadGlobalLocal(local, defaultArkMethod, globalMap);
            }
        });
        defaultArkMethod?.getBody()?.getAliasTypeMap()?.forEach(a => globalMap.set(a[0].getName(), a[0]));
    }

    private static loadClass(globalMap: Map<string, ArkExport>, cls: ArkClass): void {
        const old = globalMap.get(cls.getName());
        if (old instanceof ArkClass) {
            if (old.getCategory() === ClassCategory.CLASS) {
                this.copyMethod(cls, old);
            } else {
                this.copyMethod(old, cls);
                globalMap.delete(cls.getName());
                globalMap.set(cls.getName(), cls);
            }
        } else if (!old) {
            globalMap.set(cls.getName(), cls);
        }
    }

    private static loadGlobalLocal(local: Local, defaultArkMethod: ArkMethod, globalMap: Map<string, ArkExport>): void {
        const name = local.getName();
        local.setSignature(new LocalSignature(name, defaultArkMethod.getSignature()));
        if (defaultArkMethod.getDeclaringArkFile().getScene().getOptions().isScanAbc) {
            const instance = globalMap.get(name + 'Interface');
            const attr = globalMap.get(name + COMPONENT_ATTRIBUTE);
            if (attr instanceof ArkClass && instance instanceof ArkClass) {
                instance.getMethods().forEach(m => attr.addMethod(m));
                globalMap.set(name, attr);
                return;
            }

        }
        const old = globalMap.get(name);
        if (!old) {
            globalMap.set(name, local);
        }
    }

    private static copyMethod(from: ArkClass, to: ArkClass): void {
        from.getMethods().forEach(method => {
            const dist = method.isStatic() ? to.getStaticMethodWithName(method.getName()) : to.getMethodWithName(method.getName());
            const distSignatures = dist?.getDeclareSignatures();
            if (distSignatures) {
                method.getDeclareSignatures()?.forEach(x => distSignatures.push(x));
            } else {
                to.addMethod(method);
            }
        });
    }
}
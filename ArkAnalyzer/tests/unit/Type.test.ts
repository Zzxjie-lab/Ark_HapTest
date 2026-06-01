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

import { assert, describe, it } from 'vitest';
import path from 'path';
import {
    AliasType, AliasTypeExpr,
    ArkAliasTypeDefineStmt,
    Type,
    FileSignature, ImportInfo,
    Scene,
    SceneConfig, SourceMethodPrinter,
    Stmt,
    Local, ArkField, ArkClass,
} from '../../src';
import {
    AliasTypeMultiRef,
    AliasTypeOfBoolean,
    AliasTypeOfClassA,
    AliasTypeOfClassB, AliasTypeOfFunctionType,
    AliasTypeOfLiteralType,
    AliasTypeOfMultiQualifier,
    AliasTypeOfMultiTypeQuery,
    AliasTypeOfNumberA, AliasTypeOfObjectA,
    AliasTypeOfQueryOfLiteralType,
    AliasTypeOfSingleTypeQuery,
    AliasTypeOfString, AliasTypeOfUnionType, AliasTypeOfWholeExports,
    AliasTypeRef, SourceAliasTypeWithFunctionType,
    SourceAliasTypeWithImport, SourceAliasTypeWithLiteralType,
    SourceAliasTypeWithReference,
    SourceAliasTypeWithTypeQuery, SourceAliasTypeWithUnionType,
    SourceSimpleAliasType,
} from '../resources/type/expectedIR';

function buildScene(): Scene {
    let config: SceneConfig = new SceneConfig();
    config.buildFromProjectDir(path.join(__dirname, '../resources/type'));
    let projectScene: Scene = new Scene();
    projectScene.buildSceneFromProjectDir(config);
    projectScene.inferTypes();
    return projectScene;
}

function compareAliasType(aliasType: AliasType, expectIR: any): void {
    assert.equal(aliasType!.getOriginalType().toString(), expectIR.originalType);
    assert.equal(aliasType!.getName(), expectIR.name);
    assert.equal(aliasType!.getModifiers(), expectIR.modifiers);
    assert.equal(aliasType!.getSignature().toString(), expectIR.signature);
}

function compareTypeAliasStmt(stmt: Stmt, expectIR: any): void {
    if (expectIR.instanceof !== undefined) {
        assert.isTrue(stmt instanceof expectIR.instanceof);
    }
    if (expectIR.typeAliasExpr !== undefined && stmt instanceof ArkAliasTypeDefineStmt) {
        compareTypeAliasExpr(stmt.getAliasTypeExpr(), expectIR.typeAliasExpr);
    }
    assert.equal(stmt.toString(), expectIR.toString);
    assert.equal(stmt.getOriginPositionInfo().getLineNo(), expectIR.line);
    assert.equal(stmt.getOriginPositionInfo().getColNo(), expectIR.column);

    if (expectIR.operandColumns === undefined) {
        return;
    }
    for (let j = 0; j < expectIR.operandColumns.length; j++) {
        const expectedOpPosition = expectIR.operandColumns[j];
        const opPosition = stmt.getOperandOriginalPosition(j);
        assert.isNotNull(opPosition);
        const cols = [opPosition!.getFirstCol(), opPosition!.getLastCol()];
        assert.equal(cols[0], expectedOpPosition[0]);
        assert.equal(cols[1], expectedOpPosition[1]);
    }
}

function compareTypeAliasExpr(expr: AliasTypeExpr, expectedExpr: any): void {
    const originalObject = expr.getOriginalObject();
    assert.isTrue(originalObject instanceof expectedExpr.originalObject.instanceof);
    if (originalObject instanceof Type) {
        assert.equal(originalObject.toString(), expectedExpr.originalObject.toString);
    } else if (originalObject instanceof ImportInfo && originalObject.getLazyExportInfo()) {
        const arkExport = originalObject.getLazyExportInfo()!.getArkExport();
        assert.isDefined(arkExport);
        assert.isNotNull(arkExport);
        if (arkExport instanceof Local) {
            assert.equal(arkExport.getType().getTypeString(), expectedExpr.originalObject.lazyExportInfo.arkExport.signature);
        } else {
            assert.equal(arkExport!.getSignature().toString(), expectedExpr.originalObject.lazyExportInfo.arkExport.signature);
        }
    } else if (originalObject instanceof Local) {
        assert.equal(originalObject.getType().getTypeString(), expectedExpr.originalObject.typeString);
        assert.equal(originalObject.getDeclaringStmt()?.toString(), expectedExpr.originalObject.declaringStmt);
    } else if (originalObject instanceof ArkField) {
        assert.equal(originalObject.getSignature().toString(), expectedExpr.originalObject.signature);
    } else if (originalObject instanceof ArkClass) {
        assert.equal(originalObject.getSignature().toString(), expectedExpr.originalObject.signature);
    }
    assert.equal(expr.getTransferWithTypeOf(), expectedExpr.transferWithTypeOf);
    assert.equal(expr.toString(), expectedExpr.toString);
}

let projectScene = buildScene();
const fileId = new FileSignature(projectScene.getProjectName(), 'test.ts');
const defaultClass = projectScene.getFile(fileId)?.getDefaultClass();

describe('Simple Alias Type Test', () => {
    const method = defaultClass?.getMethodWithName('simpleAliasType');
    const aliasTypeMap = method?.getBody()?.getAliasTypeMap();
    const stmts = method?.getBody()?.getCfg().getStmts();

    it('alias type of boolean', () => {
        const alias = aliasTypeMap?.get('BooleanAliasType');
        assert.isDefined(alias);
        if (AliasTypeOfBoolean.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfBoolean.aliasType);
        }

        if (AliasTypeOfBoolean.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 2);
            compareTypeAliasStmt(stmts![1], AliasTypeOfBoolean.stmt);
        }
    });

    it('alias type of string', () => {
        const alias = aliasTypeMap?.get('StringAliasType');
        assert.isDefined(alias);
        if (AliasTypeOfString.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfString.aliasType);
        }

        if (AliasTypeOfString.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 3);
            compareTypeAliasStmt(stmts![2], AliasTypeOfString.stmt);
        }
    });

    it('alias type using in params', () => {
        const method = projectScene.getFile(fileId)?.getDefaultClass().getMethodWithName('%useAliasTypeInParam$simpleAliasType');
        assert.isDefined(method);
        assert.isNotNull(method);
        const params = method!.getSubSignature().getParameters();
        assert.equal(params.length, 1);
        const booleanAliasType = '@type/test.ts: %dflt.simpleAliasType()#BooleanAliasType';
        const stringAliasType = '@type/test.ts: %dflt.simpleAliasType()#StringAliasType';
        assert.equal(params[0].getType().toString(), `${booleanAliasType}[]|${stringAliasType}`);
    });

    it('type alias should not in locals', () => {
        const locals = method?.getBody()?.getLocals();
        assert.isDefined(locals);
        assert.equal(locals!.size, 1);
    });
});

describe('Alias Type With Import Test', () => {
    const method = defaultClass?.getMethodWithName('aliasTypeWithImport');
    const aliasTypeMap = method?.getBody()?.getAliasTypeMap();
    const stmts = method?.getBody()?.getCfg().getStmts();

    it('alias type of exported class', () => {
        const alias = aliasTypeMap?.get('ClassAType');
        assert.isDefined(alias);
        if (AliasTypeOfClassA.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfClassA.aliasType);
        }

        if (AliasTypeOfClassA.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 2);
            compareTypeAliasStmt(stmts![1], AliasTypeOfClassA.stmt);
        }

        const importInfo = projectScene.getFile(fileId)?.getImportInfoBy('ClassA');
        assert.isUndefined(importInfo);
    });

    it('alias type of default exported class', () => {
        const alias = aliasTypeMap?.get('ClassBType');
        assert.isDefined(alias);
        if (AliasTypeOfClassB.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfClassB.aliasType);
        }

        if (AliasTypeOfClassB.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 3);
            compareTypeAliasStmt(stmts![2], AliasTypeOfClassB.stmt);
        }

        let importInfo = projectScene.getFile(fileId)?.getImportInfoBy('ClassB');
        assert.isUndefined(importInfo);

        importInfo = projectScene.getFile(fileId)?.getImportInfoBy('default');
        assert.isUndefined(importInfo);
    });

    it('alias type of exported number type', () => {
        const alias = aliasTypeMap?.get('NumberAType');
        assert.isDefined(alias);
        if (AliasTypeOfNumberA.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfNumberA.aliasType);
        }

        if (AliasTypeOfNumberA.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 4);
            compareTypeAliasStmt(stmts![3], AliasTypeOfNumberA.stmt);
        }

        const importInfo = projectScene.getFile(fileId)?.getImportInfoBy('numberA');
        assert.isDefined(importInfo);
        assert.equal(importInfo!.getOriginTsPosition().getLineNo(), 16);
    });

    it('alias type of multiple qualifier', () => {
        const alias = aliasTypeMap?.get('MultiQualifierType');
        assert.isDefined(alias);
        if (AliasTypeOfMultiQualifier.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfMultiQualifier.aliasType);
        }

        if (AliasTypeOfMultiQualifier.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 5);
            compareTypeAliasStmt(stmts![4], AliasTypeOfMultiQualifier.stmt);
        }

        const importInfo = projectScene.getFile(fileId)?.getImportInfoBy('A.B.C');
        assert.isUndefined(importInfo);
    });

    it('alias type of object literal type', () => {
        const alias = aliasTypeMap?.get('ObjectAType');
        assert.isDefined(alias);
        if (AliasTypeOfObjectA.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfObjectA.aliasType);
        }

        if (AliasTypeOfObjectA.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 6);
            compareTypeAliasStmt(stmts![5], AliasTypeOfObjectA.stmt);
        }

        const importInfo = projectScene.getFile(fileId)?.getImportInfoBy('objectA');
        assert.isDefined(importInfo);
        assert.equal(importInfo!.getOriginTsPosition().getLineNo(), 16);
    });

    it('alias type of whole exports type', () => {
        const alias = aliasTypeMap?.get('WholeExportsType');
        assert.isDefined(alias);
        if (AliasTypeOfWholeExports.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfWholeExports.aliasType);
        }

        if (AliasTypeOfWholeExports.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 7);
            compareTypeAliasStmt(stmts![6], AliasTypeOfWholeExports.stmt);
        }
    });

    it('alias type using in body', () => {
        const method = projectScene.getFile(fileId)?.getDefaultClass().getMethodWithName('%useAliasTypeInBody$aliasTypeWithImport');
        assert.isDefined(method);
        assert.isNotNull(method);
        const localA = method!.getBody()?.getLocals().get('a');
        assert.isDefined(localA);
        assert.equal(localA!.getType().toString(), '@type/test.ts: %dflt.aliasTypeWithImport()#NumberAType[]');
    });

    it('type alias should not in locals', () => {
        const locals = method?.getBody()?.getLocals();

        const classAType = locals?.get('ClassAType');
        assert.isUndefined(classAType);

        const classBType = locals?.get('ClassBType');
        assert.isUndefined(classBType);

        const numberAType = locals?.get('NumberAType');
        assert.isUndefined(numberAType);

        const typeOfType = locals?.get('typeOfType');
        assert.isUndefined(typeOfType);

        const multiQualifierType = locals?.get('MultiQualifierType');
        assert.isUndefined(multiQualifierType);

        const objectAType = locals?.get('ObjectAType');
        assert.isUndefined(objectAType);

        const wholeExportsType = locals?.get('WholeExportsType');
        assert.isUndefined(wholeExportsType);
    });
});

describe('Alias Type With Type Query Test', () => {
    const method = defaultClass?.getMethodWithName('aliasTypeWithTypeQuery');
    const aliasTypeMap = method?.getBody()?.getAliasTypeMap();
    const stmts = method?.getBody()?.getCfg().getStmts();

    it('alias type of single qualifier', () => {
        const alias = aliasTypeMap?.get('SingleTypeQuery');
        assert.isDefined(alias);
        if (AliasTypeOfSingleTypeQuery.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfSingleTypeQuery.aliasType);
        }

        if (AliasTypeOfSingleTypeQuery.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 2);
            compareTypeAliasStmt(stmts![1], AliasTypeOfSingleTypeQuery.stmt);
        }
    });

    it('alias type of multiple qualifiers', () => {
        const alias = aliasTypeMap?.get('MultiTypeQuery');
        assert.isDefined(alias);
        if (AliasTypeOfMultiTypeQuery.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfMultiTypeQuery.aliasType);
        }

        if (AliasTypeOfMultiTypeQuery.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 3);
            compareTypeAliasStmt(stmts![2], AliasTypeOfMultiTypeQuery.stmt);
        }
    });

    it('type alias should not in locals', () => {
        const locals = method?.getBody()?.getLocals();

        const singleTypeQuery = locals?.get('SingleTypeQuery');
        assert.isUndefined(singleTypeQuery);

        const multiTypeQuery = locals?.get('MultiTypeQuery');
        assert.isUndefined(multiTypeQuery);
    });
});

describe('Alias Type With Reference Test', () => {
    const method = defaultClass?.getMethodWithName('aliasTypeWithReference');
    const aliasTypeMap = method?.getBody()?.getAliasTypeMap();
    const stmts = method?.getBody()?.getCfg().getStmts();

    it('alias type', () => {
        const alias = aliasTypeMap?.get('ReferType');
        assert.isDefined(alias);
        if (AliasTypeRef.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeRef.aliasType);
        }

        if (AliasTypeRef.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 2);
            compareTypeAliasStmt(stmts![1], AliasTypeRef.stmt);
        }
    });

    it('alias type of multiple reference', () => {
        const alias = aliasTypeMap?.get('MultiReferType');
        assert.isDefined(alias);
        if (AliasTypeMultiRef.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeMultiRef.aliasType);
        }

        if (AliasTypeMultiRef.stmts !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 3);
            compareTypeAliasStmt(stmts![2], AliasTypeMultiRef.stmts);
        }
    });

    it('type alias should not in locals', () => {
        const locals = method?.getBody()?.getLocals();

        const referType = locals?.get('ReferType');
        assert.isUndefined(referType);

        const multiReferType = locals?.get('MultiReferType');
        assert.isUndefined(multiReferType);
    });
});

describe('Alias Type With Literal Type Test', () => {
    const method = defaultClass?.getMethodWithName('aliasTypeWithLiteralType');
    const aliasTypeMap = method?.getBody()?.getAliasTypeMap();
    const stmts = method?.getBody()?.getCfg().getStmts();

    it('alias type of literalType', () => {
        const alias = aliasTypeMap?.get('ABC');
        assert.isDefined(alias);
        if (AliasTypeOfLiteralType.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfLiteralType.aliasType);
        }

        if (AliasTypeOfLiteralType.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 2);
            compareTypeAliasStmt(stmts![1], AliasTypeOfLiteralType.stmt);
        }
    });

    it('alias type of type query of literalType', () => {
        const alias = aliasTypeMap?.get('XYZ');
        assert.isDefined(alias);
        if (AliasTypeOfQueryOfLiteralType.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfQueryOfLiteralType.aliasType);
        }

        if (AliasTypeOfQueryOfLiteralType.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 4);
            compareTypeAliasStmt(stmts![3], AliasTypeOfQueryOfLiteralType.stmt);
        }
    });

    it('type alias should not in locals', () => {
        const locals = method?.getBody()?.getLocals();
        assert.isDefined(locals);
        assert.equal(locals!.size, 2);

        const localABC = locals?.get('ABC');
        assert.isUndefined(localABC);

        const localXYZ = locals?.get('XYZ');
        assert.isUndefined(localXYZ);
    });
});

describe('Alias Type With Function Type Test', () => {
    const method = defaultClass?.getMethodWithName('aliasTypeWithFunctionType');
    const aliasTypeMap = method?.getBody()?.getAliasTypeMap();
    const stmts = method?.getBody()?.getCfg().getStmts();

    it('alias type of FunctionType', () => {
        const alias = aliasTypeMap?.get('FunctionAliasType');
        assert.isDefined(alias);
        if (AliasTypeOfFunctionType.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfFunctionType.aliasType);
        }

        if (AliasTypeOfFunctionType.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 2);
            compareTypeAliasStmt(stmts![1], AliasTypeOfFunctionType.stmt);
        }
    });
});

describe('Alias Type With Union Type Test', () => {
    const method = defaultClass?.getMethodWithName('aliasTypeWithUnionType');
    const aliasTypeMap = method?.getBody()?.getAliasTypeMap();
    const stmts = method?.getBody()?.getCfg().getStmts();

    it('alias type of UnionType', () => {
        const alias = aliasTypeMap?.get('UnionAliasType');
        assert.isDefined(alias);
        if (AliasTypeOfUnionType.aliasType !== undefined) {
            compareAliasType(alias![0], AliasTypeOfUnionType.aliasType);
        }

        if (AliasTypeOfUnionType.stmt !== undefined) {
            assert.isDefined(stmts);
            assert.isAtLeast(stmts!.length, 2);
            compareTypeAliasStmt(stmts![1], AliasTypeOfUnionType.stmt);
        }
    });
});

describe('Save to TS Test', () => {
    let config: SceneConfig = new SceneConfig();
    config.buildFromProjectDir(path.join(__dirname, '../resources/type'));
    let scene = new Scene();
    scene.buildSceneFromProjectDir(config);
    scene.inferTypes();

    let arkFile = scene.getFiles().find((value) => {
        return value.getName() === 'test.ts';
    });

    it('case1: method simpleAliasType', () => {
        assert.isDefined(arkFile);
        let arkMethod = arkFile!.getDefaultClass().getMethodWithName('simpleAliasType');
        assert.isDefined(arkMethod);

        let printer = new SourceMethodPrinter(arkMethod!);
        let source = printer.dump();
        assert.equal(source, SourceSimpleAliasType);
    });

    it('case2: method aliasTypeWithImport', () => {
        assert.isDefined(arkFile);
        let arkMethod = arkFile!.getDefaultClass().getMethodWithName('aliasTypeWithImport');
        assert.isDefined(arkMethod);

        let printer = new SourceMethodPrinter(arkMethod!);
        let source = printer.dump();
        assert.equal(source, SourceAliasTypeWithImport);
    });

    it('case3: method aliasTypeWithTypeQuery', () => {
        assert.isDefined(arkFile);
        let arkMethod = arkFile!.getDefaultClass().getMethodWithName('aliasTypeWithTypeQuery');
        assert.isDefined(arkMethod);

        let printer = new SourceMethodPrinter(arkMethod!);
        let source = printer.dump();
        assert.equal(source, SourceAliasTypeWithTypeQuery);
    });

    it('case4: method aliasTypeWithReference', () => {
        assert.isDefined(arkFile);
        let arkMethod = arkFile!.getDefaultClass().getMethodWithName('aliasTypeWithReference');
        assert.isDefined(arkMethod);

        let printer = new SourceMethodPrinter(arkMethod!);
        let source = printer.dump();
        assert.equal(source, SourceAliasTypeWithReference);
    });

    it('case5: method aliasTypeWithLiteralType', () => {
        assert.isDefined(arkFile);
        let arkMethod = arkFile!.getDefaultClass().getMethodWithName('aliasTypeWithLiteralType');
        assert.isDefined(arkMethod);

        let printer = new SourceMethodPrinter(arkMethod!);
        let source = printer.dump();
        assert.equal(source, SourceAliasTypeWithLiteralType);
    });

    it('case6: method aliasTypeWithFunctionType', () => {
        assert.isDefined(arkFile);
        let arkMethod = arkFile!.getDefaultClass().getMethodWithName('aliasTypeWithFunctionType');
        assert.isDefined(arkMethod);

        let printer = new SourceMethodPrinter(arkMethod!);
        let source = printer.dump();
        assert.equal(source, SourceAliasTypeWithFunctionType);
    });

    it('case7: method aliasTypeWithUnionType', () => {
        assert.isDefined(arkFile);
        let arkMethod = arkFile!.getDefaultClass().getMethodWithName('aliasTypeWithUnionType');
        assert.isDefined(arkMethod);

        let printer = new SourceMethodPrinter(arkMethod!);
        let source = printer.dump();
        assert.equal(source, SourceAliasTypeWithUnionType);
    });
});
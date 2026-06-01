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

import Logger, { LOG_MODULE_TYPE } from '../../utils/logger';
import { AbstractExpr, ArkInstanceInvokeExpr, ArkStaticInvokeExpr } from '../base/Expr';
import { Local } from '../base/Local';
import {
    AbstractFieldRef,
    AbstractRef,
    ArkArrayRef,
    ArkInstanceFieldRef,
    ArkParameterRef,
    ArkStaticFieldRef,
} from '../base/Ref';
import { ArkAliasTypeDefineStmt, ArkAssignStmt, Stmt } from '../base/Stmt';
import {
    AliasType,
    AnnotationNamespaceType,
    AnyType,
    ArrayType,
    BooleanType,
    ClassType,
    FunctionType,
    GenericType,
    NeverType,
    NullType,
    NumberType,
    StringType,
    Type,
    UnclearReferenceType,
    UndefinedType,
    UnionType,
    UnknownType,
    VoidType,
} from '../base/Type';
import { ArkMethod } from '../model/ArkMethod';
import { ArkExport } from '../model/ArkExport';
import { ArkClass } from '../model/ArkClass';
import { ArkField } from '../model/ArkField';
import { Value } from '../base/Value';
import { Constant } from '../base/Constant';
import { ArkNamespace } from '../model/ArkNamespace';
import { ALL, CONSTRUCTOR_NAME, SUPER_NAME } from './TSConst';
import { ModelUtils } from './ModelUtils';
import { Builtin } from './Builtin';
import { MethodSignature } from '../model/ArkSignature';
import { INSTANCE_INIT_METHOD_NAME, LEXICAL_ENV_NAME_PREFIX, UNKNOWN_FILE_NAME } from './Const';
import { EMPTY_STRING } from './ValueUtil';
import { ImportInfo } from '../model/ArkImport';
import { MethodParameter } from '../model/builder/ArkMethodBuilder';
import { IRInference } from './IRInference';

const logger = Logger.getLogger(LOG_MODULE_TYPE.ARKANALYZER, 'TypeInference');


export class TypeInference {

    public static inferTypeInArkField(arkField: ArkField): void {
        const arkClass = arkField.getDeclaringArkClass();
        const stmts = arkField.getInitializer();
        const method = arkClass.getMethodWithName(INSTANCE_INIT_METHOD_NAME) ??
            arkClass.getMethodWithName(CONSTRUCTOR_NAME);
        for (const stmt of stmts) {
            if (method) {
                this.resolveExprsInStmt(stmt, method);
                this.resolveFieldRefsInStmt(stmt, method);
                this.resolveArkAssignStmt(stmt, method);
            }
        }
        const beforeType = arkField.getType();
        if (!this.isUnclearType(beforeType)) {
            return;
        }
        let rightType: Type | undefined;
        let fieldRef: AbstractFieldRef | undefined;
        const lastStmt = stmts[stmts.length - 1];
        if (lastStmt instanceof ArkAssignStmt) {
            rightType = lastStmt.getRightOp().getType();
            if (lastStmt.getLeftOp() instanceof AbstractFieldRef) {
                fieldRef = lastStmt.getLeftOp() as AbstractFieldRef;
            }
        }
        let fieldType;
        if (beforeType) {
            fieldType = this.inferUnclearedType(beforeType, arkClass, rightType);
        }
        if (fieldType) {
            arkField.getSignature().setType(fieldType);
            fieldRef?.setFieldSignature(arkField.getSignature());
        } else if (rightType && this.isUnclearType(beforeType) && !this.isUnclearType(rightType)) {
            arkField.getSignature().setType(rightType);
            fieldRef?.setFieldSignature(arkField.getSignature());
        }
    }

    /**
     * Infer type for a given unclear type.
     * It returns an array with 2 items, original object and original type.
     * The original object is null if there is no object, or it failed to find the object.
     * The original type is null if failed to infer the type.
     * @param leftOpType
     * @param declaringArkClass
     * @param [rightType]
     * @returns
     */
    public static inferUnclearedType(leftOpType: Type, declaringArkClass: ArkClass, rightType?: Type): Type | null | undefined {
        let type;
        if (leftOpType instanceof ClassType &&
            leftOpType.getClassSignature().getDeclaringFileSignature().getFileName() === UNKNOWN_FILE_NAME) {
            type = TypeInference.inferUnclearRefName(leftOpType.getClassSignature().getClassName(), declaringArkClass);
        } else if (leftOpType instanceof UnionType) {
            let types = leftOpType.getTypes();
            for (let i = 0; i < types.length; i++) {
                let newType = this.inferUnclearedType(types[i], declaringArkClass);
                if (newType) {
                    types[i] = newType;
                }
            }
            type = leftOpType;
        } else if (leftOpType instanceof ArrayType) {
            let baseType = this.inferUnclearedType(leftOpType.getBaseType(), declaringArkClass);
            if (baseType) {
                leftOpType.setBaseType(baseType);
                type = leftOpType;
            }
        } else if (leftOpType instanceof AliasType) {
            let baseType = this.inferUnclearedType(leftOpType.getOriginalType(), declaringArkClass);
            if (baseType) {
                leftOpType.setOriginalType(baseType);
                type = leftOpType;
            }
        } else if (leftOpType instanceof AnnotationNamespaceType) {
            type = this.inferUnclearRefName(leftOpType.getOriginType(), declaringArkClass);
        } else if (leftOpType instanceof UnclearReferenceType) {
            type = this.inferUnclearRefType(leftOpType, declaringArkClass);
        }
        return type;
    }

    public static inferTypeInMethod(arkMethod: ArkMethod): void {
        const arkClass = arkMethod.getDeclaringArkClass();
        this.inferGenericType(arkMethod.getGenericTypes(), arkClass);
        const signatures: MethodSignature[] = [];
        arkMethod.getDeclareSignatures()?.forEach(m => signatures.push(m));
        const impl = arkMethod.getImplementationSignature();
        if (impl) {
            signatures.push(impl);
        }
        signatures.forEach(s => {
            s.getMethodSubSignature().getParameters().forEach(p => {
                const type = TypeInference.inferUnclearedType(p.getType(), arkClass);
                if (type) {
                    p.setType(type);
                }
            });
            this.inferSignatureReturnType(s, arkMethod);
        });
        const body = arkMethod.getBody();
        if (!body) {
            return;
        }
        const cfg = body.getCfg();
        for (const block of cfg.getBlocks()) {
            for (const stmt of block.getStmts()) {
                this.resolveExprsInStmt(stmt, arkMethod);
                this.resolveFieldRefsInStmt(stmt, arkMethod);
                this.resolveArkAssignStmt(stmt, arkMethod);
            }
        }
    }

    /**
     * @Deprecated
     * @param arkMethod
     */
    public static inferSimpleTypeInMethod(arkMethod: ArkMethod): void {
        const body = arkMethod.getBody();
        if (!body) {
            logger.warn('empty body');
            return;
        }
        const cfg = body.getCfg();
        for (const block of cfg.getBlocks()) {
            for (const stmt of block.getStmts()) {
                TypeInference.inferSimpleTypeInStmt(stmt);
            }
        }
    }

    /**
     * infer type for Exprs in stmt which invoke method.
     * such as ArkInstanceInvokeExpr ArkStaticInvokeExpr ArkNewExpr
     */
    private static resolveExprsInStmt(stmt: Stmt, arkMethod: ArkMethod): void {
        for (const expr of stmt.getExprs()) {
            const newExpr = expr.inferType(arkMethod);
            if (stmt.containsInvokeExpr() && expr instanceof ArkInstanceInvokeExpr && newExpr instanceof ArkStaticInvokeExpr) {
                stmt.replaceUse(expr, newExpr);
            }
        }
        if (stmt instanceof ArkAliasTypeDefineStmt && this.isUnclearType(stmt.getAliasType().getOriginalType())) {
            stmt.getAliasType().setOriginalType(stmt.getAliasTypeExpr().getType());
        }
    }

    /**
     * infer type for fieldRefs in stmt.
     */
    private static resolveFieldRefsInStmt(stmt: Stmt, arkMethod: ArkMethod): void {
        for (const use of stmt.getUses()) {
            if (use instanceof AbstractRef) {
                this.processRef(use, stmt, arkMethod);
            }
        }
        const stmtDef = stmt.getDef();
        if (stmtDef && stmtDef instanceof AbstractRef) {
            const fieldRef = stmtDef.inferType(arkMethod);
            stmt.replaceDef(stmtDef, fieldRef);
        }
    }

    private static processRef(use: AbstractRef | ArkInstanceFieldRef, stmt: Stmt, arkMethod: ArkMethod): void {
        const fieldRef = use.inferType(arkMethod);
        if (fieldRef instanceof ArkStaticFieldRef && stmt instanceof ArkAssignStmt) {
            stmt.replaceUse(use, fieldRef);
        } else if (use instanceof ArkInstanceFieldRef && fieldRef instanceof ArkArrayRef && stmt instanceof ArkAssignStmt) {
            const index = fieldRef.getIndex();
            if (index instanceof Constant && index.getType() instanceof StringType) {
                const local = arkMethod?.getBody()?.getLocals().get(index.getValue());
                if (local) {
                    fieldRef.setIndex(local);
                }
            }
            stmt.replaceUse(use, fieldRef);
        }
    }

    public static parseArkExport2Type(arkExport: ArkExport | undefined | null): Type | null {
        if (!arkExport) {
            return null;
        }
        if (arkExport instanceof ArkClass) {
            return new ClassType(arkExport.getSignature(), arkExport.getGenericsTypes());
        } else if (arkExport instanceof ArkNamespace) {
            return AnnotationNamespaceType.getInstance(arkExport.getSignature());
        } else if (arkExport instanceof ArkMethod) {
            return new FunctionType(arkExport.getSignature());
        } else if (arkExport instanceof Local) {
            if (arkExport.getType() instanceof UnknownType || arkExport.getType() instanceof UnclearReferenceType) {
                return null;
            }
            return arkExport.getType();
        } else if (arkExport instanceof AliasType) {
            return arkExport;
        } else {
            return null;
        }
    }

    /**
     * infer and pass type for ArkAssignStmt right and left
     * @param stmt
     * @param arkMethod
     */
    public static resolveArkAssignStmt(stmt: Stmt, arkMethod: ArkMethod): void {
        if (!(stmt instanceof ArkAssignStmt)) {
            return;
        }
        const arkClass = arkMethod.getDeclaringArkClass();
        const rightOp = stmt.getRightOp();
        let rightType: Type | null | undefined = rightOp.getType();
        if (this.isUnclearType(rightType)) {
            rightType = this.inferUnclearedType(rightType, arkClass);
            if (rightType) {
                this.setValueType(rightOp, rightType);
            }
        }
        const leftOp = stmt.getLeftOp();
        let leftType: Type | null | undefined = leftOp.getType();
        if (this.isUnclearType(leftType)) {
            leftType = this.inferUnclearedType(leftType, arkClass);
            if (!leftType && !this.isUnclearType(rightType)) {
                leftType = rightType;
            }
        }
        if (leftType && !this.isUnclearType(leftType)) {
            this.setValueType(leftOp, leftType);
            if (leftOp instanceof Local && stmt.getOriginalText()?.startsWith(leftOp.getName())) {
                let localDef = ModelUtils.findDeclaredLocal(leftOp, arkMethod);
                if (localDef && this.isUnclearType(localDef.getType())) {
                    localDef.setType(leftType);
                }
            }
            if (rightType) {
                IRInference.inferRightWithSdkType(leftType, rightType, arkClass);
            }
        }
    }

    private static setValueType(value: Value, type: Type): void {
        if (value instanceof Local || value instanceof ArkParameterRef) {
            value.setType(type);
        } else if (value instanceof AbstractFieldRef) {
            value.getFieldSignature().setType(type);
        }
    }

    public static isUnclearType(type: Type | null | undefined): boolean {
        if (!type || type instanceof UnknownType || type instanceof UnclearReferenceType
            || type instanceof NullType || type instanceof UndefinedType) {
            return true;
        } else if (type instanceof ClassType
            && type.getClassSignature().getDeclaringFileSignature().getFileName() === UNKNOWN_FILE_NAME) {
            return true;
        } else if (type instanceof UnionType) {
            return !!type.getTypes().find(t => t instanceof UnclearReferenceType);
        } else if (type instanceof ArrayType) {
            return (type.getBaseType() instanceof UnclearReferenceType);
        } else if (type instanceof AliasType) {
            return (type.getOriginalType() instanceof UnclearReferenceType);
        }
        return false;
    }

    public static inferSimpleTypeInStmt(stmt: Stmt): void {
        if (stmt instanceof ArkAssignStmt) {
            const leftOp = stmt.getLeftOp();
            if (leftOp instanceof Local) {
                const leftOpType = leftOp.getType();
                if (leftOpType instanceof UnknownType) {
                    const rightOp = stmt.getRightOp();
                    leftOp.setType(rightOp.getType());
                }
            }
        }
    }

    // Deal only with simple situations
    public static buildTypeFromStr(typeStr: string): Type {
        switch (typeStr) {
            case 'boolean':
                return BooleanType.getInstance();
            case 'number':
                return NumberType.getInstance();
            case 'string':
                return StringType.getInstance();
            case 'undefined':
                return UndefinedType.getInstance();
            case 'null':
                return NullType.getInstance();
            case 'any':
                return AnyType.getInstance();
            case 'void':
                return VoidType.getInstance();
            case 'never':
                return NeverType.getInstance();
            case 'RegularExpression': {
                const classSignature = Builtin.REGEXP_CLASS_SIGNATURE;
                return new ClassType(classSignature);
            }
            default:
                return new UnclearReferenceType(typeStr);
        }
    }

    public static inferValueType(value: Value, arkMethod: ArkMethod): Type | null {
        if (value instanceof ArkInstanceFieldRef || value instanceof ArkInstanceInvokeExpr) {
            this.inferValueType(value.getBase(), arkMethod);
        }
        if (value instanceof AbstractRef || value instanceof AbstractExpr || value instanceof Local) {
            value.inferType(arkMethod);
        }
        return value.getType();
    }

    public static inferSignatureReturnType(oldSignature: MethodSignature, arkMethod: ArkMethod): void {
        if (oldSignature.getMethodSubSignature().getMethodName() === CONSTRUCTOR_NAME) {
            const newReturnType = new ClassType(oldSignature.getDeclaringClassSignature());
            oldSignature.getMethodSubSignature().setReturnType(newReturnType);
            return;
        }
        const currReturnType = oldSignature.getType();
        if (!this.isUnclearType(currReturnType)) {
            return;
        }
        const newReturnType = this.inferUnclearedType(currReturnType, arkMethod.getDeclaringArkClass());
        if (newReturnType) {
            oldSignature.getMethodSubSignature().setReturnType(newReturnType);
        } else if (arkMethod.getBody()) {
            const typeMap: Map<string, Type> = new Map();
            for (let returnValue of arkMethod.getReturnValues()) {
                const type = returnValue.getType();
                if (type instanceof UnionType) {
                    type.flatType().filter(t => !TypeInference.isUnclearType(t)).forEach(t => typeMap.set(t.toString(), t));
                } else if (!TypeInference.isUnclearType(type)) {
                    typeMap.set(type.toString(), type);
                }
            }
            if (typeMap.size > 0) {
                const types: Type[] = Array.from(typeMap.values());
                oldSignature.getMethodSubSignature().setReturnType(types.length === 1 ? types[0] : new UnionType(types));
            }
        }
    }

    public static inferGenericType(types: GenericType[] | undefined, arkClass: ArkClass) {
        types?.forEach(type => {
            const defaultType = type.getDefaultType();
            if (defaultType instanceof UnclearReferenceType) {
                const newDefaultType = TypeInference.inferUnclearRefName(defaultType.getName(), arkClass);
                if (newDefaultType) {
                    type.setDefaultType(this.replaceTypeWithReal(newDefaultType));
                }
            }
            const constraint = type.getConstraint();
            if (constraint instanceof UnclearReferenceType) {
                const newConstraint = TypeInference.inferUnclearRefName(constraint.getName(), arkClass);
                if (newConstraint) {
                    type.setConstraint(this.replaceTypeWithReal(newConstraint));
                }
            }
        });
    }

    /**
     * Infer type for a given {@link UnclearReferenceType} type.
     * It returns original type.
     * The original type is null if it failed to infer the type.
     * @param urType
     * @param arkClass
     * @returns
     */
    public static inferUnclearRefType(urType: UnclearReferenceType, arkClass: ArkClass): Type | null {
        const realTypes = urType.getGenericTypes();
        this.inferRealGenericTypes(realTypes, arkClass);
        if (urType.getName() === Builtin.ARRAY) {
            return new ArrayType(realTypes[0] ?? AnyType.getInstance(), 1);
        }
        let type = this.inferUnclearRefName(urType.getName(), arkClass);
        return type ? this.replaceTypeWithReal(type, realTypes) : null;

    }

    /**
     * Find out the original object and type for a given unclear reference type name.
     * It returns original type.
     * The original type is null if it failed to infer the type.
     * @param refName
     * @param arkClass
     * @returns
     */
    public static inferUnclearRefName(refName: string, arkClass: ArkClass): Type | null {
        if (!refName) {
            return null;
        }
        //split and iterate to infer each type
        const singleNames = refName.split('.');
        let type = null;
        for (let i = 0; i < singleNames.length; i++) {
            let genericName: string = EMPTY_STRING;
            const name = singleNames[i].replace(/<(\w+)>/, (match, group1) => {
                genericName = group1;
                return EMPTY_STRING;
            });
            if (i === 0) {
                type = this.inferBaseType(name, arkClass);
            } else if (type) {
                type = this.inferFieldType(type, name, arkClass)?.[1];
            }
            if (!type) {
                return null;
            }
            if (genericName) {
                const realTypes = genericName.split(',').map(generic => {
                    const realType = this.inferBaseType(generic, arkClass);
                    return realType ?? new UnclearReferenceType(generic);
                });
                if (type instanceof ClassType) {
                    type = new ClassType(type.getClassSignature(), realTypes);
                } else if (type instanceof FunctionType) {
                    type = new FunctionType(type.getMethodSignature(), realTypes);
                }
            }
        }
        return type;
    }

    /**
     * Find out the original object and type for a given base type and the field name.
     * It returns an array with 2 items, original object and original type.
     * The original object is null if there is no object, or it failed to find the object.
     * The original type is null if it failed to infer the type.
     * @param baseType
     * @param fieldName
     * @param declareClass
     * @returns
     */
    public static inferFieldType(baseType: Type, fieldName: string, declareClass: ArkClass): [any, Type] | null {
        if (baseType instanceof AliasType) {
            baseType = baseType.getOriginalType();
        } else if (baseType instanceof UnionType && baseType.getCurrType()) {
            baseType = baseType.getCurrType();
        }
        let propertyAndType: [any, Type] | null = null;
        if (baseType instanceof ClassType) {
            const arkClass = declareClass.getDeclaringArkFile().getScene().getClass(baseType.getClassSignature());
            if (!arkClass && fieldName === Builtin.ITERATOR_RESULT_VALUE && baseType.getClassSignature()
                .getDeclaringFileSignature().getProjectName() === Builtin.DUMMY_PROJECT_NAME) {
                const types = baseType.getRealGenericTypes();
                if (types && types.length > 0) {
                    propertyAndType = [null, types[0]];
                }
            }
            if (!arkClass) {
                return propertyAndType;
            }
            if (arkClass.isAnonymousClass()) {
                const fieldType = this.inferUnclearRefName(fieldName, arkClass);
                return fieldType ? [null, fieldType] : null;
            }
            const property = ModelUtils.findPropertyInClass(fieldName, arkClass);
            let propertyType: Type | null = null;
            if (property instanceof ArkField) {
                propertyType = property.getType();
            } else if (property) {
                propertyType = this.parseArkExport2Type(property);
            }
            if (propertyType) {
                propertyAndType = [property, propertyType];
            }
        } else if (baseType instanceof AnnotationNamespaceType) {
            const namespace = declareClass.getDeclaringArkFile().getScene().getNamespace(baseType.getNamespaceSignature());
            if (namespace) {
                const property = ModelUtils.findPropertyInNamespace(fieldName, namespace);
                const propertyType = this.parseArkExport2Type(property);
                if (propertyType) {
                    propertyAndType = [property, propertyType];
                }
            }
        } else {
            logger.warn('infer unclear reference type fail: ' + fieldName);
        }
        return propertyAndType;
    }

    /**
     * Find out the original object and type for a given base name.
     * It returns original type.
     * The original type is null if failed to infer the type.
     * @param baseName
     * @param arkClass
     * @returns
     */
    public static inferBaseType(baseName: string, arkClass: ArkClass): Type | null {
        if (SUPER_NAME === baseName) {
            return this.parseArkExport2Type(arkClass.getSuperClass());
        }
        const field = ModelUtils.getDefaultClass(arkClass)?.getDefaultArkMethod()
            ?.getBody()?.getLocals()?.get(baseName);
        if (field && !this.isUnclearType(field.getType())) {
            return field.getType();
        }
        let arkExport: ArkExport | null = ModelUtils.getClassWithName(baseName, arkClass)
            ?? ModelUtils.getNamespaceWithName(baseName, arkClass)
            ?? ModelUtils.getDefaultClass(arkClass)?.getMethodWithName(baseName)
            ?? ModelUtils.getDefaultClass(arkClass)?.getDefaultArkMethod()?.getBody()?.getAliasTypeByName(baseName)
            ?? ModelUtils.getArkExportInImportInfoWithName(baseName, arkClass.getDeclaringArkFile());
        if (!arkExport && !arkClass.getDeclaringArkFile().getImportInfoBy(baseName)) {
            arkExport = arkClass.getDeclaringArkFile().getScene().getSdkGlobal(baseName);
        }
        return this.parseArkExport2Type(arkExport);
    }

    public static inferRealGenericTypes(realTypes: Type[] | undefined, arkClass: ArkClass): void {
        if (!realTypes) {
            return;
        }
        for (let i = 0; i < realTypes.length; i++) {
            const mayType = realTypes[i];
            if (this.isUnclearType(mayType)) {
                const newType = this.inferUnclearedType(mayType, arkClass);
                if (newType) {
                    realTypes[i] = newType;
                }
            }
        }
    }


    public static inferDynamicImportType(from: string, arkClass: ArkClass): Type | null {
        const importInfo = new ImportInfo();
        importInfo.setNameBeforeAs(ALL);
        importInfo.setImportClauseName(ALL);
        importInfo.setImportFrom(from);
        importInfo.setDeclaringArkFile(arkClass.getDeclaringArkFile());
        return TypeInference.parseArkExport2Type(importInfo.getLazyExportInfo()?.getArkExport());
    }


    public static replaceTypeWithReal(type: Type, realTypes?: Type[]): Type {
        if (type instanceof ClassType) {
            const replacedTypes = type.getRealGenericTypes()?.map(g => this.replaceTypeWithReal(g, realTypes)) ?? realTypes;
            return replacedTypes && replacedTypes.length > 0 ? new ClassType(type.getClassSignature(), replacedTypes) : type;
        } else if (type instanceof FunctionType) {
            const replacedTypes = type.getRealGenericTypes()?.map(g => this.replaceTypeWithReal(g, realTypes)) ?? realTypes;
            return replacedTypes && replacedTypes.length > 0 ? new FunctionType(type.getMethodSignature(), replacedTypes) : type;
        } else if (type instanceof AliasType && realTypes) {
            let lastAlias = type;
            let originalType;
            while ((originalType = lastAlias.getOriginalType()) instanceof AliasType) {
                lastAlias = originalType;
            }
            lastAlias.setOriginalType(this.replaceTypeWithReal(originalType, realTypes));
        } else if (type instanceof UnionType && realTypes) {
            const types: Type[] = [];
            type.flatType().forEach(t => types.push(this.replaceTypeWithReal(t, realTypes)));
            return new UnionType(types, this.replaceTypeWithReal(type.getCurrType(), realTypes));
        } else if (type instanceof GenericType) {
            const realType = realTypes?.[type.getIndex()] ?? type.getDefaultType() ?? type.getConstraint();
            if (realType) {
                return realType;
            }
        } else if (type instanceof AnyType) {
            const realType = realTypes?.[0];
            if (realType) {
                return realType;
            }
        }
        return type;
    }

    public static replaceAliasType(type: Type): Type {
        let aliasType = type;
        while (aliasType instanceof AliasType) {
            aliasType = aliasType.getOriginalType();
        }
        return aliasType;
    }


    public static inferFunctionType(argType: FunctionType, params: MethodParameter[] | undefined, realTypes: Type[] | undefined): void {
        if (!params) {
            return;
        }
        argType.getMethodSignature().getMethodSubSignature().getParameters()
            .filter(p => !p.getName().startsWith(LEXICAL_ENV_NAME_PREFIX))
            .forEach((p, i) => {
                let type = params?.[i]?.getType();
                if (type instanceof GenericType && realTypes) {
                    type = realTypes?.[type.getIndex()];
                }
                if (type) {
                    p.setType(type);
                }
            });
    }

}

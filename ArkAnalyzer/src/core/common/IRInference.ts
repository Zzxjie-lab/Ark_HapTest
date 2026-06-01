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
import { ArkMethod } from '../model/ArkMethod';
import {
    AliasType,
    AnnotationNamespaceType,
    AnyType,
    ArrayType,
    ClassType,
    FunctionType,
    GenericType,
    NullType,
    Type,
    UnclearReferenceType,
    UndefinedType,
    UnionType
} from '../base/Type';
import { Local } from '../base/Local';
import { TypeInference } from './TypeInference';
import {
    AbstractExpr,
    AbstractInvokeExpr,
    AliasTypeExpr,
    ArkInstanceInvokeExpr,
    ArkStaticInvokeExpr
} from '../base/Expr';
import Logger, { LOG_MODULE_TYPE } from '../../utils/logger';
import { Scene } from '../../Scene';
import { ArkClass } from '../model/ArkClass';
import { findArkExport, ModelUtils } from './ModelUtils';
import { ArkField } from '../model/ArkField';
import { CALL_BACK } from './EtsConst';
import {
    AliasClassSignature,
    BaseSignature,
    ClassSignature,
    FieldSignature,
    MethodSignature,
    MethodSubSignature
} from '../model/ArkSignature';
import { CONSTRUCTOR_NAME, IMPORT, THIS_NAME } from './TSConst';
import { Builtin } from './Builtin';
import { ArkBody } from '../model/ArkBody';
import { ArkAssignStmt } from '../base/Stmt';
import {
    AbstractFieldRef,
    AbstractRef,
    ArkArrayRef,
    ArkInstanceFieldRef,
    ArkParameterRef,
    ArkStaticFieldRef
} from '../base/Ref';
import { Value } from '../base/Value';
import { Constant } from '../base/Constant';
import {
    ANONYMOUS_CLASS_PREFIX,
    ANONYMOUS_METHOD_PREFIX,
    CALL_SIGNATURE_NAME,
    DEFAULT_ARK_CLASS_NAME,
    NAME_DELIMITER,
    UNKNOWN_CLASS_NAME
} from './Const';
import { ValueUtil } from './ValueUtil';
import { ArkFile } from '../model/ArkFile';

const logger = Logger.getLogger(LOG_MODULE_TYPE.ARKANALYZER, 'IRInference');

export class IRInference {

    private static inferExportInfos(file: ArkFile): void {
        file.getExportInfos().forEach(exportInfo => {
            if (exportInfo.getArkExport() === undefined) {
                let arkExport = findArkExport(exportInfo);
                exportInfo.setArkExport(arkExport);
                if (arkExport) {
                    exportInfo.setExportClauseType(arkExport.getExportType());
                }
            }
        });
    }

    private static inferImportInfos(file: ArkFile): void {
        file.getImportInfos().forEach(importInfo => {
            importInfo.getLazyExportInfo();
        });
    }

    public static inferFile(file: ArkFile): void {
        this.inferImportInfos(file);
        ModelUtils.getAllClassesInFile(file).forEach(arkClass => {
            TypeInference.inferGenericType(arkClass.getGenericsTypes(), arkClass);
            const defaultArkMethod = arkClass.getDefaultArkMethod();
            if (defaultArkMethod) {
                TypeInference.inferTypeInMethod(defaultArkMethod);
            }
            arkClass.getFields().forEach(arkField => TypeInference.inferTypeInArkField(arkField));
            const methods = arkClass.getMethods().sort((a, b) => {
                const name = a.getName().split(NAME_DELIMITER).reverse().join();
                const anotherName = b.getName().split(NAME_DELIMITER).reverse().join();
                if (name.startsWith(anotherName)) {
                    return 1;
                } else if (anotherName.startsWith(name)) {
                    return -1;
                }
                return 0;
            });
            methods.forEach(arkMethod => TypeInference.inferTypeInMethod(arkMethod));
        });
        this.inferExportInfos(file);
    }

    public static inferStaticInvokeExpr(expr: ArkStaticInvokeExpr, arkMethod: ArkMethod): AbstractInvokeExpr {
        const arkClass = arkMethod.getDeclaringArkClass();
        const methodName = expr.getMethodSignature().getMethodSubSignature().getMethodName();
        if (methodName === IMPORT) {
            const arg = expr.getArg(0);
            let type;
            if (arg instanceof Constant) {
                type = TypeInference.inferDynamicImportType(arg.getValue(), arkClass);
            }
            if (type) {
                expr.getMethodSignature().getMethodSubSignature().setReturnType(type);
            }
            return expr;
        }
        const className = expr.getMethodSignature().getDeclaringClassSignature().getClassName();
        if (className && className !== UNKNOWN_CLASS_NAME) {
            const baseType = TypeInference.inferUnclearRefName(className, arkClass);
            if (baseType) {
                let result = this.inferInvokeExpr(expr, baseType, methodName, arkClass.getDeclaringArkFile().getScene());
                if (result) {
                    this.inferArgs(result, arkMethod);
                    return result;
                }
            }
            return expr;
        }
        this.inferStaticInvokeExprByMethodName(methodName, arkMethod, expr);
        return expr;
    }

    private static inferStaticInvokeExprByMethodName(methodName: string, arkMethod: ArkMethod, expr: ArkStaticInvokeExpr): void {
        const arkClass = arkMethod.getDeclaringArkClass();
        const arkExport = ModelUtils.getStaticMethodWithName(methodName, arkClass) ??
            arkMethod.getFunctionLocal(methodName) ??
            ModelUtils.findDeclaredLocal(new Local(methodName), arkMethod) ??
            ModelUtils.getArkExportInImportInfoWithName(methodName, arkClass.getDeclaringArkFile()) ??
            arkClass.getDeclaringArkFile().getScene().getSdkGlobal(methodName);
        let method;
        let signature;
        if (arkExport instanceof ArkMethod) {
            method = arkExport;
        } else if (arkExport instanceof ArkClass) {
            method = arkExport.getMethodWithName(CONSTRUCTOR_NAME);
        } else if (arkExport instanceof Local) {
            const type = arkExport.getType();
            if (type instanceof ClassType) {
                const cls = arkClass.getDeclaringArkFile().getScene().getClass(type.getClassSignature());
                method = cls?.getMethodWithName(CONSTRUCTOR_NAME) ?? cls?.getMethodWithName(CALL_SIGNATURE_NAME);
            } else if (type instanceof FunctionType) {
                signature = type.getMethodSignature();
            }
        } else if (arkExport instanceof AliasType && arkExport.getOriginalType() instanceof FunctionType) {
            signature = (arkExport.getOriginalType() as FunctionType).getMethodSignature();
        }
        if (method) {
            signature = method.matchMethodSignature(expr.getArgs());
            TypeInference.inferSignatureReturnType(signature, method);
        }
        if (signature) {
            signature = this.generateNewMethodSignature(methodName, signature);
            expr.setMethodSignature(signature);
            this.inferArgs(expr, arkMethod);
        }
    }

    private static generateNewMethodSignature(methodName: string, signature: MethodSignature): MethodSignature {
        if (signature.getMethodSubSignature().getMethodName().startsWith(ANONYMOUS_METHOD_PREFIX)) {
            const subSignature = signature.getMethodSubSignature();
            const newSubSignature = new MethodSubSignature(methodName, subSignature.getParameters(),
                subSignature.getReturnType(), subSignature.isStatic());
            return new MethodSignature(signature.getDeclaringClassSignature(), newSubSignature);
        }
        return signature;
    }

    public static inferInstanceInvokeExpr(expr: ArkInstanceInvokeExpr, arkMethod: ArkMethod): AbstractInvokeExpr {
        const arkClass = arkMethod.getDeclaringArkClass();
        TypeInference.inferRealGenericTypes(expr.getRealGenericTypes(), arkClass);
        this.inferLocal(expr.getBase(), arkMethod);

        const baseType: Type = TypeInference.replaceAliasType(expr.getBase().getType());
        const methodName = expr.getMethodSignature().getMethodSubSignature().getMethodName();
        const scene = arkClass.getDeclaringArkFile().getScene();
        if ((methodName === 'forEach') && (baseType instanceof ArrayType)) {
            this.processForEach(expr.getArg(0), baseType, scene);
            return expr;
        }

        let result = this.inferInvokeExpr(expr, baseType, methodName, scene);
        if (result) {
            this.inferArgs(result, arkMethod);
            return result;
        }
        logger.warn('invoke ArkInstanceInvokeExpr MethodSignature type fail: ', expr.toString());
        return expr;
    }

    public static inferFieldRef(ref: ArkInstanceFieldRef, arkMethod: ArkMethod): AbstractRef {
        this.inferLocal(ref.getBase(), arkMethod);
        const baseType: Type = TypeInference.replaceAliasType(ref.getBase().getType());
        if (baseType instanceof ArrayType && ref.getFieldName() !== 'length') {
            return new ArkArrayRef(ref.getBase(), ValueUtil.createConst(ref.getFieldName()));
        }
        const arkClass = arkMethod.getDeclaringArkClass();
        let newFieldSignature = this.generateNewFieldSignature(ref, arkClass, baseType);
        if (newFieldSignature) {
            if (newFieldSignature.isStatic()) {
                return new ArkStaticFieldRef(newFieldSignature);
            }
            ref.setFieldSignature(newFieldSignature);
        }
        return ref;
    }

    private static inferArgs(expr: AbstractInvokeExpr, arkMethod: ArkMethod): void {
        const scene = arkMethod.getDeclaringArkFile().getScene();
        const parameters = expr.getMethodSignature().getMethodSubSignature().getParameters();
        let realTypes: Type[] = [];
        const len = expr.getArgs().length;
        for (let index = 0; index < len; index++) {
            const arg = expr.getArg(index);
            TypeInference.inferValueType(arg, arkMethod);
            if (index >= parameters.length) {
                break;
            }
            const argType = arg.getType();
            const paramType = parameters[index].getType();
            this.inferArg(expr, argType, paramType, scene, realTypes);
        }
        if (realTypes.length > 0 && !expr.getRealGenericTypes()) {
            expr.setRealGenericTypes(realTypes);
        }
    }

    private static inferArg(expr: AbstractInvokeExpr, argType: Type, paramType: Type, scene: Scene, realTypes: Type[]): void {
        if (paramType instanceof UnionType) {
            paramType.getTypes().forEach(t => this.inferArg(expr, argType, t, scene, realTypes));
        } else if (paramType instanceof AliasType) {
            this.inferArg(expr, argType, paramType.getOriginalType(), scene, realTypes);
        } else if (paramType instanceof ArrayType && argType instanceof ArrayType) {
            this.inferArg(expr, argType.getBaseType(), paramType.getBaseType(), scene, realTypes);
        }

        if (paramType instanceof ClassType && scene.getProjectSdkMap().has(paramType.getClassSignature()
            .getDeclaringFileSignature().getProjectName())) {
            this.inferArgTypeWithSdk(paramType, scene, argType);
        } else if (paramType instanceof GenericType || paramType instanceof AnyType) {
            realTypes.push(argType);
        } else if (paramType instanceof FunctionType && argType instanceof FunctionType) {
            const params = paramType.getMethodSignature().getMethodSubSignature().getParameters();
            const realTypes = expr.getRealGenericTypes();
            TypeInference.inferFunctionType(argType, params, realTypes);
        }
    }

    public static inferRightWithSdkType(leftType: Type, rightType: Type, ackClass: ArkClass): void {
        if (leftType instanceof AliasType) {
            this.inferRightWithSdkType(TypeInference.replaceAliasType(leftType), rightType, ackClass);
        } else if (leftType instanceof UnionType) {
            leftType.getTypes().forEach(t => this.inferRightWithSdkType(t, rightType, ackClass));
        } else if (leftType instanceof ClassType) {
            IRInference.inferArgTypeWithSdk(leftType, ackClass.getDeclaringArkFile().getScene(), rightType);
        } else if (rightType instanceof ArrayType && leftType instanceof ArrayType) {
            const baseType = TypeInference.replaceAliasType(leftType.getBaseType());
            if (baseType instanceof ClassType) {
                IRInference.inferArgTypeWithSdk(baseType, ackClass.getDeclaringArkFile().getScene(), rightType);
            }
        }
    }

    public static inferArgTypeWithSdk(sdkType: ClassType, scene: Scene, argType: Type): void {
        if (!scene.getProjectSdkMap().has(sdkType.getClassSignature().getDeclaringFileSignature().getProjectName())) {
            return;
        }
        if (argType instanceof UnionType) {
            argType.getTypes().forEach(t => this.inferArgTypeWithSdk(sdkType, scene, t));
        } else if (argType instanceof ClassType && argType.getClassSignature().getClassName().startsWith(ANONYMOUS_CLASS_PREFIX)) {
            this.inferAnonymousClass(scene.getClass(argType.getClassSignature()), sdkType.getClassSignature());
        } else if (argType instanceof FunctionType) {
            const params = scene.getClass(sdkType.getClassSignature())?.getMethodWithName(CALL_SIGNATURE_NAME)?.getParameters();
            const realTypes = sdkType.getRealGenericTypes();
            TypeInference.inferFunctionType(argType, params, realTypes);
        }
    }


    private static inferInvokeExpr(expr: AbstractInvokeExpr, baseType: Type, methodName: string, scene: Scene): AbstractInvokeExpr | null {
        if (baseType instanceof AliasType) {
            return this.inferInvokeExpr(expr, baseType.getOriginalType(), methodName, scene);
        } else if (baseType instanceof UnionType) {
            for (let type of baseType.flatType()) {
                if (type instanceof UndefinedType || type instanceof NullType) {
                    continue;
                }
                let result = this.inferInvokeExpr(expr, type, methodName, scene);
                if (result) {
                    return result;
                }
            }
        }
        if (baseType instanceof ClassType) {
            return this.inferInvokeExprWithDeclaredClass(expr, baseType, methodName, scene);
        } else if (baseType instanceof AnnotationNamespaceType) {
            const namespace = scene.getNamespace(baseType.getNamespaceSignature());
            if (namespace) {
                const foundMethod = ModelUtils.findPropertyInNamespace(methodName, namespace);
                if (foundMethod instanceof ArkMethod) {
                    let signature = foundMethod.matchMethodSignature(expr.getArgs());
                    TypeInference.inferSignatureReturnType(signature, foundMethod);
                    expr.setMethodSignature(signature);
                    return expr instanceof ArkInstanceInvokeExpr ?
                        new ArkStaticInvokeExpr(signature, expr.getArgs(), expr.getRealGenericTypes()) : expr;
                }
            }
        } else if (baseType instanceof FunctionType) {
            expr.setMethodSignature(baseType.getMethodSignature());
            return expr;
        } else if (baseType instanceof ArrayType && methodName === Builtin.ITERATOR_FUNCTION) {
            const returnType = expr.getMethodSignature().getMethodSubSignature().getReturnType();
            if (returnType instanceof ClassType && returnType.getClassSignature().getDeclaringFileSignature()
                .getProjectName() === Builtin.DUMMY_PROJECT_NAME) {
                returnType.setRealGenericTypes([baseType.getBaseType()]);
                return expr;
            }
        }
        return null;
    }

    private static inferInvokeExprWithDeclaredClass(expr: AbstractInvokeExpr, baseType: ClassType, methodName: string,
                                                    scene: Scene): AbstractInvokeExpr | null {
        let declaredClass = scene.getClass(baseType.getClassSignature());
        if (!declaredClass) {
            const globalClass = scene.getSdkGlobal(baseType.getClassSignature().getClassName());
            if (globalClass instanceof ArkClass) {
                declaredClass = globalClass;
            }
        }
        const method = declaredClass ? ModelUtils.findPropertyInClass(methodName, declaredClass) : null;
        if (method instanceof ArkMethod) {
            const methodSignature = method.matchMethodSignature(expr.getArgs());
            TypeInference.inferSignatureReturnType(methodSignature, method);
            expr.setMethodSignature(this.replaceMethodSignature(expr.getMethodSignature(), methodSignature));
            expr.setRealGenericTypes(IRInference.getRealTypes(method, declaredClass, baseType));
            if (method.isStatic() && expr instanceof ArkInstanceInvokeExpr) {
                return new ArkStaticInvokeExpr(methodSignature, expr.getArgs(), expr.getRealGenericTypes());
            }
            return expr;
        } else if (method instanceof ArkField) {
            const type = method.getType();
            if (type instanceof FunctionType) {
                expr.setMethodSignature(this.generateNewMethodSignature(methodName, type.getMethodSignature()));
                return expr;
            } else if (type instanceof ClassType && type.getClassSignature().getClassName().endsWith(CALL_BACK)) {
                const callback = scene.getClass(type.getClassSignature())?.getMethodWithName(CALL_SIGNATURE_NAME);
                if (callback) {
                    expr.setMethodSignature(callback.getSignature());
                    return expr;
                }
            }
        } else if (methodName === CONSTRUCTOR_NAME) { //sdk隐式构造
            const subSignature = new MethodSubSignature(methodName, [],
                new ClassType(baseType.getClassSignature()));
            const signature = new MethodSignature(baseType.getClassSignature(), subSignature);
            expr.setMethodSignature(signature);
            return expr;
        } else if (methodName === Builtin.ITERATOR_NEXT) { //sdk隐式构造
            const returnType = expr.getMethodSignature().getMethodSubSignature().getReturnType();
            if (returnType instanceof ClassType && returnType.getClassSignature().getDeclaringFileSignature()
                .getProjectName() === Builtin.DUMMY_PROJECT_NAME) {
                returnType.setRealGenericTypes(baseType.getRealGenericTypes());
                return expr;
            }
        }
        return null;
    }

    private static getRealTypes(method: ArkMethod, declaredClass: ArkClass | null, baseType: ClassType): Type[] | undefined {
        let realTypes;
        if (method.getDeclaringArkClass() === declaredClass) {
            realTypes = baseType.getRealGenericTypes();
        } else if (declaredClass?.getRealTypes()) {
            realTypes = declaredClass?.getRealTypes();
        } else if (declaredClass?.hasComponentDecorator()) {
            realTypes = [new ClassType(declaredClass?.getSignature())];
        }
        return realTypes;
    }

    public static replaceMethodSignature(init: MethodSignature, declared: MethodSignature): MethodSignature {
        const className = init.getDeclaringClassSignature().getClassName();
        let classSignature;
        if (declared.getDeclaringClassSignature().getClassName().endsWith('Interface')) {
            classSignature = new AliasClassSignature(className, declared.getDeclaringClassSignature());
        }
        let newSubSignature;
        if (classSignature || newSubSignature) {
            return new MethodSignature(classSignature ?? declared.getDeclaringClassSignature(),
                newSubSignature ?? declared.getMethodSubSignature());
        }
        return declared;
    }

    private static processForEach(arg: Value, baseType: ArrayType, scene: Scene): void {
        const argType = arg.getType();
        if (argType instanceof FunctionType) {
            const argMethodSignature = argType.getMethodSignature();
            const argMethod = scene.getMethod(argMethodSignature);
            if (argMethod != null && argMethod.getBody()) {
                const body = argMethod.getBody() as ArkBody;
                const firstStmt = body.getCfg().getStartingStmt();
                if ((firstStmt instanceof ArkAssignStmt) && (firstStmt.getRightOp() instanceof ArkParameterRef)) {
                    const parameterRef = firstStmt.getRightOp() as ArkParameterRef;
                    parameterRef.setType(baseType.getBaseType());
                }
                TypeInference.inferTypeInMethod(argMethod);
            }
        } else {
            logger.warn(`arg of forEach must be callable`);
        }
    }

    private static inferLocal(base: Local, arkMethod: ArkMethod): void {
        const arkClass = arkMethod.getDeclaringArkClass();
        if (base.getName() === THIS_NAME && arkClass.isAnonymousClass()) {
            return;
        }
        let baseType: Type | null | undefined = base.getType();
        if (baseType instanceof UnclearReferenceType) {
            baseType = TypeInference.inferUnclearRefName(baseType.getName(), arkClass);
        } else if (TypeInference.isUnclearType(baseType)) {
            const declaringStmt = base.getDeclaringStmt();
            if (!declaringStmt || !declaringStmt.getOriginalText() || declaringStmt.getOriginalText()?.startsWith(base.getName())) {
                baseType = ModelUtils.findDeclaredLocal(base, arkMethod)?.getType() ?? TypeInference.inferBaseType(base.getName(), arkClass);
            }
        }
        if (baseType && !TypeInference.isUnclearType(baseType)) {
            base.setType(baseType);
        }
    }

    private static generateNewFieldSignature(ref: AbstractFieldRef, arkClass: ArkClass, baseType: Type): FieldSignature | null {
        if (baseType instanceof UnionType) {
            for (let type of baseType.flatType()) {
                if (type instanceof UndefinedType || type instanceof NullType) {
                    continue;
                }
                let newFieldSignature = this.generateNewFieldSignature(ref, arkClass, type);
                if (!TypeInference.isUnclearType(newFieldSignature?.getType())) {
                    return newFieldSignature;
                }
            }
            return null;
        } else if (baseType instanceof AliasType) {
            return this.generateNewFieldSignature(ref, arkClass, baseType.getOriginalType());
        }
        const fieldName = ref.getFieldName().replace(/[\"|\']/g, '');
        const propertyAndType = TypeInference.inferFieldType(baseType, fieldName, arkClass);
        let propertyType = propertyAndType?.[1];
        if (propertyType && TypeInference.isUnclearType(propertyType)) {
            const newType = TypeInference.inferUnclearedType(propertyType, arkClass);
            if (newType) {
                propertyType = newType;
            }
        }
        let staticFlag: boolean;
        let signature: BaseSignature;
        if (baseType instanceof ClassType) {
            const property = propertyAndType?.[0];
            if (property instanceof ArkField) {
                return property.getSignature();
            }
            staticFlag = baseType.getClassSignature().getClassName() === DEFAULT_ARK_CLASS_NAME ||
                (property instanceof ArkMethod && property.isStatic());
            signature = property instanceof ArkMethod ? property.getSignature().getDeclaringClassSignature() : baseType.getClassSignature();
        } else if (baseType instanceof AnnotationNamespaceType) {
            staticFlag = true;
            signature = baseType.getNamespaceSignature();
        } else {
            return null;
        }
        return new FieldSignature(fieldName, signature, propertyType ?? ref.getType(), staticFlag);
    }


    public static inferAnonymousClass(anon: ArkClass | null, declaredSignature: ClassSignature, set: Set<string> = new Set()): void {
        if (!anon) {
            return;
        }
        const key = anon.getSignature().toString();
        if (set.has(key)) {
            return;
        } else {
            set.add(key);
        }
        const scene = anon.getDeclaringArkFile().getScene();
        const declaredClass = scene.getClass(declaredSignature);
        if (!declaredClass) {
            return;
        }
        for (const anonField of anon.getFields()) {
            const property = ModelUtils.findPropertyInClass(anonField.getName(), declaredClass);
            if (property instanceof ArkField) {
                this.assignAnonField(property, anonField, scene, set);
            }
        }
        for (const anonMethod of anon.getMethods()) {
            const methodSignature = declaredClass.getMethodWithName(anonMethod.getName())
                ?.matchMethodSignature(anonMethod.getSubSignature().getParameters());
            if (methodSignature) {
                anonMethod.setImplementationSignature(methodSignature);
            }
        }
    }


    private static assignAnonField(property: ArkField, anonField: ArkField, scene: Scene, set: Set<string>): void {
        function deepInfer(anonType: Type, declaredSignature: ClassSignature): void {
            if (anonType instanceof ClassType && anonType.getClassSignature().getClassName().startsWith(ANONYMOUS_CLASS_PREFIX)) {
                IRInference.inferAnonymousClass(scene.getClass(anonType.getClassSignature()), declaredSignature, set);
            }
        }

        const type = property.getSignature().getType();
        const lastStmt = anonField.getInitializer().at(-1);
        if (lastStmt instanceof ArkAssignStmt) {
            const rightType = lastStmt.getRightOp().getType();
            if (type instanceof ClassType) {
                deepInfer(rightType, type.getClassSignature());
            } else if (type instanceof ArrayType && type.getBaseType() instanceof ClassType &&
                rightType instanceof ArrayType) {
                const baseType = rightType.getBaseType();
                const classSignature = (type.getBaseType() as ClassType).getClassSignature();
                if (baseType instanceof UnionType) {
                    baseType.getTypes().forEach(t => deepInfer(t, classSignature));
                } else {
                    deepInfer(rightType.getBaseType(), classSignature);
                }
            }
            const leftOp = lastStmt.getLeftOp();
            if (leftOp instanceof AbstractFieldRef) {
                leftOp.setFieldSignature(property.getSignature());
            }
        }
        anonField.setSignature(property.getSignature());
    }

    public static inferAliasTypeExpr(expr: AliasTypeExpr, arkMethod: ArkMethod): AbstractExpr {
        const originalObject = expr.getOriginalObject();
        let model;
        if (originalObject instanceof Local) {
            model = ModelUtils.findArkModelByRefName(originalObject.getName(), arkMethod.getDeclaringArkClass());
        } else if (originalObject instanceof Type) {
            const type = TypeInference.inferUnclearedType(originalObject, arkMethod.getDeclaringArkClass());
            if (type instanceof ClassType) {
                const scene = arkMethod.getDeclaringArkFile().getScene();
                model = ModelUtils.findArkModelBySignature(type.getClassSignature(), scene);
            } else if (type) {
                model = type;
            }
        }
        if (AliasTypeExpr.isAliasTypeOriginalModel(model)) {
            expr.setOriginalObject(model);
        }
        return expr;
    }
}
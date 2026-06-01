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

import {
    AliasType,
    ArkAliasTypeDefineStmt, ArkClass, ArkField, BooleanType,
    DEFAULT_ARK_CLASS_NAME, ImportInfo, Local, LiteralType, StringType, ArkMethod,
    UnionType,
} from '../../../src';

export const AliasTypeOfBoolean = {
    aliasType: {
        name: 'BooleanAliasType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.simpleAliasType()#BooleanAliasType`,
        modifiers: 0,
        originalType: 'boolean'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: BooleanType,
                toString: 'boolean'
            },
            transferWithTypeOf: false,
            toString: 'boolean'
        },
        toString: 'type BooleanAliasType = boolean',
        line: 19,
        column: 5,
        operandColumns: [[10, 26], [29, 36]]
    }
};

export const AliasTypeOfString = {
    aliasType: {
        name: 'StringAliasType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.simpleAliasType()#StringAliasType`,
        modifiers: 0,
        originalType: 'string'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: StringType,
                toString: 'string'
            },
            transferWithTypeOf: false,
            toString: 'string'
        },
        toString: 'type StringAliasType = string',
        line: 20,
        column: 5,
        operandColumns: [[10, 25], [28, 34]]
    }
};

export const AliasTypeOfClassA = {
    aliasType: {
        name: 'ClassAType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithImport()#ClassAType`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: ClassA',
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ImportInfo,
                lazyExportInfo: {
                    arkExport: {
                        signature: '@type/exportExample.ts: ClassA'
                    }
                }
            },
            transferWithTypeOf: false,
            toString: 'import(\'./exportExample\').ClassA'
        },
        toString: 'type ClassAType = import(\'./exportExample\').ClassA',
        line: 28,
        column: 5,
        operandColumns: [[10, 20], [23, 55]]
    }
};

export const AliasTypeOfClassB = {
    aliasType: {
        name: 'ClassBType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithImport()#ClassBType`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: ClassB',
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ImportInfo,
                lazyExportInfo: {
                    arkExport: {
                        signature: '@type/exportExample.ts: ClassB'
                    }
                }
            },
            transferWithTypeOf: false,
            toString: 'import(\'./exportExample\').default'
        },
        toString: 'type ClassBType = import(\'./exportExample\').default',
        line: 29,
        column: 5,
        operandColumns: [[10, 20], [23, 56]]
    }
};

export const AliasTypeOfNumberA = {
    aliasType: {
        name: 'NumberAType',
        signature: `@type/test.ts: %dflt.aliasTypeWithImport()#NumberAType`,
        modifiers: 0,
        originalType: `@type/exportExample.ts: %dflt.[static]%dflt()#numberA`,
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ImportInfo,
                lazyExportInfo: {
                    arkExport: {
                        signature: '@type/exportExample.ts: %dflt.[static]%dflt()#numberA'
                    }
                }
            },
            transferWithTypeOf: false,
            toString: 'import(\'./exportExample\').numberA'
        },
        toString: 'type NumberAType = import(\'./exportExample\').numberA',
        line: 30,
        column: 5,
        operandColumns: [[10, 21], [24, 57]]
    }
};

export const AliasTypeOfMultiQualifier = {
    aliasType: {
        name: 'MultiQualifierType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithImport()#MultiQualifierType`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: A.B.C'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ImportInfo,
                lazyExportInfo: {
                    arkExport: {
                        signature: '@type/exportExample.ts: A.B.C'
                    }
                },
            },
            transferWithTypeOf: false,
            toString: 'import(\'./exportExample\').A.B.C'
        },
        toString: 'type MultiQualifierType = import(\'./exportExample\').A.B.C',
        line: 31,
        column: 5,
        operandColumns: [[10, 28], [31, 62]]
    }
};

export const AliasTypeOfObjectA = {
    aliasType: {
        name: 'ObjectAType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithImport()#ObjectAType`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: %AC$%dflt$%dflt$0'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ImportInfo,
                lazyExportInfo: {
                    arkExport: {
                        signature: '@type/exportExample.ts: %AC$%dflt$%dflt$0'
                    }
                },
            },
            transferWithTypeOf: true,
            toString: 'typeof import(\'./exportExample\').objectA'
        },
        toString: 'type ObjectAType = typeof import(\'./exportExample\').objectA',
        line: 33,
        column: 5,
        operandColumns: [[10, 21], [24, 64]]
    }
};

// TODO: originalObject should be the map of all exports of the import file
export const AliasTypeOfWholeExports = {
    aliasType: {
        name: 'WholeExportsType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithImport()#WholeExportsType`,
        modifiers: 0,
        originalType: 'unknown'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ImportInfo,
                lazyExportInfo: null
            },
            transferWithTypeOf: true,
            toString: 'typeof import(\'./exportExample\')'
        },
        toString: 'type WholeExportsType = typeof import(\'./exportExample\')',
        line: 34,
        column: 5,
        operandColumns: [[10, 26], [29, 61]]
    }
};

export const AliasTypeOfSingleTypeQuery = {
    aliasType: {
        name: 'SingleTypeQuery',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithTypeQuery()#SingleTypeQuery`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: %AC$%dflt$%dflt$0'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: Local,
                typeString: '@type/exportExample.ts: %AC$%dflt$%dflt$0',
                declaringStmt: 'objectA = %0'
            },
            transferWithTypeOf: true,
            toString: 'typeof objectA'
        },
        toString: 'type SingleTypeQuery = typeof objectA',
        line: 43,
        column: 5,
        operandColumns: [[10, 25], [28, 42]]
    }
};

// TODO: expr with ArkField toString should be objectA.a.b.c
export const AliasTypeOfMultiTypeQuery = {
    aliasType: {
        name: 'MultiTypeQuery',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithTypeQuery()#MultiTypeQuery`,
        modifiers: 0,
        originalType: 'string'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ArkField,
                signature: '@type/exportExample.ts: %AC$%AC$%AC$%dflt$%dflt$0$%instInit$1$%instInit$2.c'
            },
            transferWithTypeOf: true,
            toString: 'typeof c'
        },
        toString: 'type MultiTypeQuery = typeof c',
        line: 44,
        column: 5,
        operandColumns: [[10, 24], [27, 47]]
    }
};

export const AliasTypeRef = {
    aliasType: {
        name: 'ReferType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithReference()#ReferType`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: %dflt.[static]%dflt()#numberA'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: AliasType,
                toString: '@type/exportExample.ts: %dflt.[static]%dflt()#numberA'
            },
            transferWithTypeOf: false,
            toString: '@type/exportExample.ts: %dflt.[static]%dflt()#numberA'
        },
        toString: 'type ReferType = @type/exportExample.ts: %dflt.[static]%dflt()#numberA',
        line: 48,
        column: 5,
        operandColumns: [[10, 19], [22, 29]]
    }
};

export const AliasTypeMultiRef = {
    aliasType: {
        name: 'MultiReferType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithReference()#MultiReferType`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: A.B.C'
    },
    stmts: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ArkClass,
                signature: '@type/exportExample.ts: A.B.C'
            },
            transferWithTypeOf: false,
            toString: '@type/exportExample.ts: A.B.C'
        },
        toString: 'type MultiReferType = @type/exportExample.ts: A.B.C',
        line: 49,
        column: 5,
        operandColumns: [[10, 24], [27, 32]]
    }
};

export const AliasTypeOfLiteralType = {
    aliasType: {
        name: 'ABC',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithLiteralType()#ABC`,
        modifiers: 16384,
        originalType: '\'123\''
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: LiteralType,
                toString: '\'123\''
            },
            transferWithTypeOf: false,
            toString: '\'123\''
        },
        toString: 'declare type ABC = \'123\'',
        line: 53,
        column: 5,
        operandColumns: [[18, 21], [24, 29]]
    }
};

export const AliasTypeOfQueryOfLiteralType = {
    aliasType: {
        name: 'XYZ',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithLiteralType()#XYZ`,
        modifiers: 0,
        originalType: '@type/test.ts: %dflt.aliasTypeWithLiteralType()#ABC'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: Local,
                typeString: '@type/test.ts: %dflt.aliasTypeWithLiteralType()#ABC',
                declaringStmt: 'a = \'123\''
            },
            transferWithTypeOf: true,
            toString: 'typeof a'
        },
        toString: 'type XYZ = typeof a',
        line: 55,
        column: 5,
        operandColumns: [[10, 13], [16, 24]]
    }
};

export const AliasTypeOfFunctionType = {
    aliasType: {
        name: 'FunctionAliasType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithFunctionType()#FunctionAliasType`,
        modifiers: 0,
        originalType: '@type/test.ts: %dflt.aliasTypeWithLiteralType()'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: ArkMethod,
                toString: '@type/test.ts: %dflt.aliasTypeWithLiteralType()'
            },
            transferWithTypeOf: true,
            toString: 'typeof @type/test.ts: %dflt.aliasTypeWithLiteralType()'
        },
        toString: 'type FunctionAliasType = typeof @type/test.ts: %dflt.aliasTypeWithLiteralType()',
        line: 59,
        column: 5,
        operandColumns: [[10, 27], [30, 61]]
    }
};

export const AliasTypeOfUnionType = {
    aliasType: {
        name: 'UnionAliasType',
        signature: `@type/test.ts: ${DEFAULT_ARK_CLASS_NAME}.aliasTypeWithUnionType()#UnionAliasType`,
        modifiers: 0,
        originalType: '@type/exportExample.ts: A.B.C|@type/exportExample.ts: %dflt.[static]%dflt()#numberA'
    },
    stmt: {
        instanceof: ArkAliasTypeDefineStmt,
        typeAliasExpr: {
            originalObject: {
                instanceof: UnionType,
                toString: '@type/exportExample.ts: A.B.C|@type/exportExample.ts: %dflt.[static]%dflt()#numberA'
            },
            transferWithTypeOf: false,
            toString: '@type/exportExample.ts: A.B.C|@type/exportExample.ts: %dflt.[static]%dflt()#numberA'
        },
        toString: 'type UnionAliasType = @type/exportExample.ts: A.B.C|@type/exportExample.ts: %dflt.[static]%dflt()#numberA',
        line: 63,
        column: 5,
        operandColumns: [[10, 24], [27, 42]]
    }
};

export const SourceSimpleAliasType = `function simpleAliasType(): void {
  type BooleanAliasType = boolean;
  type StringAliasType = string;
}
`;

export const SourceAliasTypeWithImport = `function aliasTypeWithImport(): void {
  type ClassAType = import('./exportExample').ClassA;
  type ClassBType = import('./exportExample').default;
  type NumberAType = import('./exportExample').numberA;
  type MultiQualifierType = import('./exportExample').A.B.C;
  type ObjectAType = typeof import('./exportExample').objectA;
  type WholeExportsType = typeof import('./exportExample');
}
`;

// TODO: MultiTypeQuery expr should be typeof objectA.a.b.c
export const SourceAliasTypeWithTypeQuery = `function aliasTypeWithTypeQuery(): void {
  type SingleTypeQuery = typeof objectA;
  type MultiTypeQuery = typeof c;
}
`;

export const SourceAliasTypeWithReference = `function aliasTypeWithReference(): void {
  type ReferType = numberA;
  type MultiReferType = A.B.C;
}
`;

export const SourceAliasTypeWithLiteralType = `function aliasTypeWithLiteralType(): void {
  declare type ABC = '123';
  let a: ABC = '123';
  type XYZ = typeof a;
}
`;

export const SourceAliasTypeWithFunctionType = `function aliasTypeWithFunctionType(): void {
  type FunctionAliasType = typeof aliasTypeWithLiteralType;
}
`;

export const SourceAliasTypeWithUnionType = `function aliasTypeWithUnionType(): void {
  type UnionAliasType = A.B.C | numberA;
}
`;
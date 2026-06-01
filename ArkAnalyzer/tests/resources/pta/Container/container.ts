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

namespace Container {
    let n: number = 0;
    class Element {
        public base: number = ++ n;

        public getBase() {
            return this.base;
        }
    }

    class ArrayTest {
        array: Element[][];
        public test() {
            this.array = [[]];
            this.array.push([new Element()]);
            let a = [];
            a.push();
            let b = this.getArrayElement();
        }

        public getArrayElement() {
            return this.array[1][0];
        }
    }

    class SetTest {
        public test() {
            let set = new Set();
            let ele = new Element();
            set.add(ele);
        }
    }

    class MapTest {
        public test() {
            let map = new Map();
            let ele = new Element();
            map.set(ele.getBase(), ele);
        }
    }

    function main() {
        let setTest: SetTest = new SetTest();
        let mapTest: MapTest = new MapTest();

        setTest.test();
        mapTest.test();
    }
}
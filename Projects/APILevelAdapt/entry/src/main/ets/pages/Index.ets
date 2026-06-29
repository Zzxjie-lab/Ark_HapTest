/*
 * Copyright (c) 2025 Huawei Device Co., Ltd.
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

import { Route, ROUTES } from '../constants/CommonConstants';

@Entry
@Component
struct Index {
  private routes: Route[] = ROUTES;
  private pageInfos: NavPathStack = new NavPathStack();
  build() {
    Navigation(this.pageInfos) {
        List() {
          ForEach(this.routes, (item: Route, index: number) => {
            ListItem() {
              Column() {
                Row() {
                  Text(item.title)
                    .width('91.1%')
                    .height(48)
                    .fontWeight(FontWeight.Medium)
                    .fontSize('16fp')
                  SymbolGlyph($r('sys.symbol.chevron_forward'))
                    .fontSize($r('sys.float.padding_level12'))
                    .fontColor([$r('sys.color.font_tertiary')])
                }
                .padding({ left: 12 })
                .onClick(() => {
                  this.pageInfos.pushPath({
                    name: item.to
                  })
                })
                if (this.routes.length - 1 !== index) {
                  Divider()
                    .strokeWidth(0.5)
                    .color('#0D000000')
                    .width('93%')
                }
              }
            }
            .height(48)
          }, (item: Route, index: number) => JSON.stringify(item) + index)
        }
        .borderRadius(15)
        .width('91.1%')
        .height(48 * this.routes.length)
        .constraintSize({maxHeight: '100%'})
        .backgroundColor(Color.White)
    }
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
    .height('100%')
    .width('100%')
    .title($r('app.string.index_label'))
    .backgroundColor($r('app.color.common_backgroundColor'))
  }
}

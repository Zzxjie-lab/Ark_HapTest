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

import { NodeContent } from '@kit.ArkUI';
import nativeNode from 'libentry.so';

@Builder
export function ButtonDisplaySceneBuilder() {
  ButtonDisplayScene()
}

@Component
struct ButtonDisplayScene {
  private rootSlot = new NodeContent();

  aboutToAppear(): void {
    nativeNode.createButtonNativeRoot(this.rootSlot);
  }

  aboutToDisappear(): void {
    nativeNode.destroyButtonNativeRoot();
  }

  build() {
    NavDestination() {
      Column() {
        Row() {
          // Bind NodeContent and ContentSlot placeholder components.
          ContentSlot(this.rootSlot)
        }
      }
      .justifyContent(FlexAlign.End)
      .padding({
        left: 16,
        right: 16,
        bottom: 16
      })
      .width('100%')
      .height('100%')
    }
    .title($r('app.string.button_display_scene'))
    .backgroundColor($r('app.color.common_backgroundColor'))
  }
}
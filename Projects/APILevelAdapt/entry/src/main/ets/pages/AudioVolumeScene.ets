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

import testNapi from 'libentry.so';
import CommonUtils from '../utils/CommonUtils';

@Builder
export function AudioVolumeSceneBuilder() {
  AudioVolumeScene()
}

@Builder
function AudioVolumeScene() {
  NavDestination() {
    Column() {
      Row() {
        Button($r('app.string.audio_volume_button_label'))
          .width('100%')
          .onClick(() => {
            const isExisted = testNapi.checkAudioVolumeManagerExists();
            const ctx = AppStorage.get('uiContext') as UIContext | undefined;
            CommonUtils.showToast(ctx, isExisted ? $r('app.string.support_label') : $r('app.string.unsupport_label'));
          })
      }
      .width('100%')
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
  .title($r('app.string.audio_volume_scene'))
  .backgroundColor($r('app.color.common_backgroundColor'))
}
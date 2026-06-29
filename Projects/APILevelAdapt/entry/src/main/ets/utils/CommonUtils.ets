/*
 * Copyright (c) 2025 Huawei Device Co., Ltd.
 * Licensed under the Apache License,Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Logger } from './Logger';

/**
 * Common utility helpers shared across the project.
 */
export default class CommonUtils {
  public static showToast(ctx: UIContext | undefined, curMsg: ResourceStr) {
    const uiContext = ctx ?? AppStorage.get('uiContext') as UIContext | undefined;
    if (!uiContext) {
      Logger.warn('UIContext is not available');
      return;
    }
    try {
      uiContext?.getPromptAction().showToast({
        message: curMsg,
        duration: 1500
      });
    } catch (error) {
      Logger.error(`Failed to open toast dialog, error info: ${JSON.stringify(error)}`);
    }
  }
}
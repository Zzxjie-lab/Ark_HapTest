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

import { NodeContent } from "@kit.ArkUI";

/**
 * Creates a native root node for a button component in the ArkUI framework.
 * @param content - Entity Encapsulation of Node Content
 * @returns void
 */
export const createButtonNativeRoot: (content: NodeContent) => void;

/**
 * Destroys the native root node for a button component and releases associated resources.
 * @returns void
 */
export const destroyButtonNativeRoot: () => void;

/**
 * Checks whether the OH_AudioManager_GetAudioVolumeManager function exists in the dynamic library.
 * @returns void
 */
export const checkAudioVolumeManagerExists: () => boolean;
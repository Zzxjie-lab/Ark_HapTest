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

/**
 * Route type define
 */
export interface Route {
  title: ResourceStr;
  to: string;
}

export const ACTION_BAR_SCENE_NAME: string = 'ActionBarScene';

export const BUTTON_DISPLAY_SCENE_NAME: string = 'ButtonDisplayScene';

export const SCROLL_SCENE_NAME: string = 'ScrollScene';

export const MARQUEE_DISPLAY_SCENE_NAME: string = 'MarqueeDisplayScene';

export const AUDIO_VOLUME_SCENE_NAME: string = 'AudioVolumeScene';

export const ROUTES: Route[] = [
  {
    title: $r('app.string.action_bar_scene'),
    to: ACTION_BAR_SCENE_NAME
  },
  {
    title: $r('app.string.button_display_scene'),
    to: BUTTON_DISPLAY_SCENE_NAME
  },
  {
    title: $r('app.string.scroll_scene'),
    to: SCROLL_SCENE_NAME
  },
  {
    title: $r('app.string.marquee_display_scene'),
    to: MARQUEE_DISPLAY_SCENE_NAME
  },
  {
    title: $r('app.string.audio_volume_scene'),
    to: AUDIO_VOLUME_SCENE_NAME
  }
]

export const SCENERY_IMAGE_LIST: Resource[] = [
  $r('app.media.scenery1'),
  $r('app.media.scenery2'),
  $r('app.media.scenery3'),
  $r('app.media.scenery4'),
  $r('app.media.scenery5'),
  $r('app.media.scenery6'),
  $r('app.media.scenery7'),
  $r('app.media.scenery8'),
  $r('app.media.scenery9'),
  $r('app.media.scenery10'),
  $r('app.media.scenery11')
]


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

import { deviceInfo } from '@kit.BasicServicesKit';
import { SCENERY_IMAGE_LIST } from '../constants/CommonConstants';
import CommonUtils from '../utils/CommonUtils';
import { Logger } from '../utils/Logger';

// Type definition for feature installer function that applies specific features to a ScrollAttribute instance
type FeatureInstaller = (instance: ScrollAttribute) => void;

// Interface defining a feature specification with minimum API version requirement and installer function
interface FeatureSpec {
  minVersion: number;
  installer: FeatureInstaller;
}

const ctx = AppStorage.get('uiContext') as UIContext | undefined;
// Registry to track whether onDidScroll feature has been installed for a ScrollAttribute instance
// Using WeakSet to avoid memory leaks and allow garbage collection of unused instances
const didScrollRegistry = new WeakSet<ScrollAttribute>();
// Registry to track whether onScrollEdge feature has been installed for a ScrollAttribute instance
const scrollEdgeRegistry = new WeakSet<ScrollAttribute>();
// Registry to track whether zoom features have been installed for a ScrollAttribute instance
const zoomRegistry = new WeakSet<ScrollAttribute>();
// Registry to ensure the toast is shown only once per fling cycle
const flingToastRegistry = new WeakMap<ScrollAttribute, boolean>();

// Array of feature specifications organized by minimum API version requirements
const FEATURE_SPECS: ReadonlyArray<FeatureSpec> = [
  {
    minVersion: 12,
    installer: (instance: ScrollAttribute) => {
      // Skip installation if this feature is already registered for the instance
      if (didScrollRegistry.has(instance)) {
        return;
      }
      // API 12+ supports `onDidScroll` callback for tracking scroll events
      instance.onDidScroll((_xOffset: number, _yOffset: number, scrollState: ScrollState) => {
        const hasToastShown = flingToastRegistry.get(instance) ?? false;
        if (scrollState === ScrollState.Fling) {
          if (!hasToastShown) {
            CommonUtils.showToast(ctx, $r('app.string.fling_prompt_dialog_tip'));
            flingToastRegistry.set(instance, true);
          }
        } else if (hasToastShown) {
          // Reset the flag when leaving the fling state so future fling actions can trigger the toast again
          flingToastRegistry.set(instance, false);
        }
      });
      // Mark this instance as having the feature installed to prevent duplicate registration
      didScrollRegistry.add(instance);
    }
  },
  {
    minVersion: 18,
    installer: (instance: ScrollAttribute) => {
      // Skip installation if this feature is already registered for the instance
      if (scrollEdgeRegistry.has(instance)) {
        return;
      }
      // API 18+ enhances scroll edge detection capabilities
      instance.onScrollEdge((side: Edge) => {
        if (side === Edge.Top) {
          CommonUtils.showToast(ctx, $r('app.string.scroll_to_top_tip'));
        } else if (side === Edge.Bottom) {
          CommonUtils.showToast(ctx, $r('app.string.scroll_to_bottom_tip'));
        }
      });
      // Mark this instance as having the feature installed to prevent duplicate registration
      scrollEdgeRegistry.add(instance);
    }
  },
  {
    minVersion: 20,
    installer: (instance: ScrollAttribute) => {
      // Skip installation if this feature is already registered for the instance
      if (zoomRegistry.has(instance)) {
        return;
      }
      // API 20+ introduces zoom capabilities for scrollable content
      instance.maxZoomScale(2);
      instance.minZoomScale(1);
      instance.enableBouncesZoom(true);

      // Register zoom event callbacks
      instance.onDidZoom((scale: number) => {
        Logger.info(`onDidZoom:${scale}`);
      });
      instance.onZoomStart(() => {
        CommonUtils.showToast(ctx, $r('app.string.zoom_start_trigger_tip'));
      });
      instance.onZoomStop(() => {
        CommonUtils.showToast(ctx, $r('app.string.zoom_stop_trigger_tip'));
      });

      // Mark this instance as having the feature installed to prevent duplicate registration
      zoomRegistry.add(instance);
    }
  }
];

// Custom attribute modifier that dynamically applies features based on device API version
class MyModifier implements AttributeModifier<ScrollAttribute> {
  applyNormalAttribute(instance: ScrollAttribute): void {
    // Get current device SDK API version
    const sdkVersion: number = deviceInfo.sdkApiVersion ?? 0;
    // Apply all compatible features based on device API version
    FEATURE_SPECS.forEach(feature => {
      if (sdkVersion >= feature.minVersion) {
        feature.installer(instance);
      }
    });
  }
}

// Instance of our custom modifier to apply version-adaptive features
const adaptModifier: MyModifier = new MyModifier();
// Determine scroll direction based on API version:
// Use FREE direction on API 20+ (supports zoom), otherwise use VERTICAL
const scrollDirection: ScrollDirection =
  (deviceInfo.sdkApiVersion ?? 0) >= 20 ? ScrollDirection.FREE : ScrollDirection.Vertical;

@Builder
export function ScrollSceneBuilder() {
  ScrollScene()
}

@Builder
export function ScrollScene() {
  NavDestination() {
    Column() {
      Scroll() {
        Column() {
          ForEach(SCENERY_IMAGE_LIST, (src: Resource) => {
            Row() {
              Image(src)
                .objectFit(ImageFit.Cover)
            }
            .width('90%')
            .height(150)
            .backgroundColor(0xFFFFFF)
            .borderRadius(15)
            .clip(true)
            .justifyContent(FlexAlign.Center)
            .margin({ top: 10 })
          }, (item: Resource, index: number) => `${index}_${JSON.stringify(item)}`)
        }
        .width('100%')
      }
      .scrollable(scrollDirection)
      .scrollBar(BarState.Off)
      .width('100%')
      .attributeModifier(adaptModifier)
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
    }
    .width('100%')
    .height('100%')
  }
  .title($r('app.string.scroll_scene'))
  .backgroundColor($r('app.color.common_backgroundColor'))
}
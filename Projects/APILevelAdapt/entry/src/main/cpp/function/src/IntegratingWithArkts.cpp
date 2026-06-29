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

#include <arkui/native_node_napi.h>
#include <string>
#include <deviceinfo.h>
#include <dlfcn.h>
#include <ohaudio/native_audio_volume_manager.h>
#include <arkui/native_type.h>
#include "ArkUIButtonNode.h"
#include "NativeEntry.h"
#include "hilog/log.h"
#include "napi/native_api.h"
#include "IntegratingWithArkts.h"

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x3200
#define LOG_TAG "APILevelAdapt"

namespace NativeModule {
NativeEntry nativeEntry;
constexpr int MIN_API_VERSION_5_1_1 = 50101;

napi_value CreateButtonNativeRoot(napi_env env, napi_callback_info info)
{
    size_t argc = 1;
    napi_value args[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    
    // Check if the number of arguments is  1
    if (argc != 1) {
        napi_throw_error(env, nullptr, "Expected 1 argument");
        return nullptr;
    }

    // Get NodeContent.
    ArkUI_NodeContentHandle contentHandle;
    int32_t resultCode = OH_ArkUI_GetNodeContentFromNapiValue(env, args[0], &contentHandle);
    if (resultCode != ARKUI_ERROR_CODE_NO_ERROR) {
        napi_throw_error(env, nullptr, "Failed to get node content from Napi value");
        return nullptr;
    }
    nativeEntry.SetContentHandle(contentHandle);

    // Create a text list.
    auto list = CreateButtonExample();
    // Keep the Native side objects in the management class and maintain their lifecycle.
    nativeEntry.SetRootNode(list);

    return nullptr;
}
// [Start button_api]
std::shared_ptr<ArkUIBaseNode> CreateButtonExample()
{
    auto textNode = std::make_shared<ArkUIButtonNode>();
    textNode->SetTextContent(std::string("Hello World"));
    // [StartExclude button_api]
    textNode->SetFontSize(TEXT_FONT_SIZE);
    textNode->SetPercentWidth(1);
    textNode->SetHeight(TEXT_HEIGHT);
    textNode->SetTextAlign(ARKUI_TEXT_ALIGNMENT_CENTER);
    // [EndExclude button_api]
    // Regarding the proprietary interfaces of HarmonyOS, specifically the interfaces marked as since M.F.S(N).
    // Compatibility judgment, the value corresponding to version 5.1.1(19) is 50101,
    // which is derived from the new interface's since field 5*10000 + 1*100 + 1.
    if (OH_GetDistributionOSApiVersion() >= MIN_API_VERSION_5_1_1) {
        textNode->SetButtonType(ARKUI_BUTTON_ROUNDED_RECTANGLE);
    } else {
        textNode->SetButtonType(ARKUI_BUTTON_TYPE_CAPSULE);
    }
    return textNode;
}
// [End button_api]

napi_value DestroyButtonNativeRoot(napi_env env, napi_callback_info info)
{
    size_t argc = 0;
    napi_value args[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc != 0) {
        napi_throw_error(env, nullptr, "Expected 0 argument");
        return nullptr;
    }
    nativeEntry.DisposeRootNode();
    return nullptr;
}

/**
 * Checks whether the OH_AudioManager_GetAudioVolumeManager function exists in the dynamic library.
 * This function dynamically loads the location library and attempts to retrieve
 * the specified function symbol. The result indicates the availability of the
 * location API on the current system.
 */
napi_value CheckAudioVolumeManagerExists(napi_env env, napi_callback_info info)
{
    size_t argc = 0;
    napi_value args[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc != 0) {
        napi_throw_error(env, nullptr, "Expected 0 argument");
        return nullptr;
    }
    // Handle to the dynamically loaded library
    void *handle = NULL;
    // Function pointer declaration for the target API
    OH_AudioCommon_Result (*OH_AudioManager_GetAudioVolumeManager_Test)(OH_AudioVolumeManager **);
    // Initialize function pointer to NULL
    OH_AudioManager_GetAudioVolumeManager_Test = NULL;
    // Flag indicating whether the function exists
    bool isExisted = false;

    // Attempt to dynamically load the location library
    handle = dlopen("libohaudio.so", RTLD_LAZY);
    if (handle != NULL) {
        // Retrieve the address of the OH_AudioManager_GetAudioVolumeManager function from the library
        OH_AudioManager_GetAudioVolumeManager_Test =
            (OH_AudioCommon_Result(*)(OH_AudioVolumeManager **))dlsym(handle, "OH_AudioManager_GetAudioVolumeManager");

        // Set flag based on whether the function symbol was successfully found
        isExisted = OH_AudioManager_GetAudioVolumeManager_Test != NULL;

        // Close the library handle to release resources
        dlclose(handle);
    } else {
        const char* error = dlerror();
        if (error != NULL) {
            OH_LOG_INFO(LOG_APP, "Failed to load library: %s", error);
        } else {
            OH_LOG_INFO(LOG_APP, "Failed to load library: unknown error");
        }
    }
    napi_value result = NULL;
    napi_get_boolean(env, isExisted, &result);
    return result;
}
} // namespace NativeModule
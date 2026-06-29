# the minimum version of CMake.
cmake_minimum_required(VERSION 3.5.0)
project(NDKCreateUI)

set(NATIVERENDER_ROOT_PATH ${CMAKE_CURRENT_SOURCE_DIR})
set(CMAKE_CXX_STANDARD 17)

if(DEFINED PACKAGE_FIND_FILE)
    include(${PACKAGE_FIND_FILE})
endif()

# -----------------------
# Third party library path
# -----------------------
set(BOUNDSCHECK_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/libboundscheck")

include_directories(${NATIVERENDER_ROOT_PATH}
                    ${NATIVERENDER_ROOT_PATH}/classdef/include
                    ${NATIVERENDER_ROOT_PATH}/function/include
                    ${BOUNDSCHECK_SRC_DIR}/include)

file(GLOB BASECLADD_SOURCES "./classdef/src/*.cpp")

file(GLOB FUNCTION_SOURCES "./function/src/*.cpp")

file(GLOB_RECURSE SOURCE_FILES "${BOUNDSCHECK_SRC_DIR}/src/*.c")

add_library(entry SHARED
            napi_init.cpp
            ${BASECLADD_SOURCES}
            ${FUNCTION_SOURCES}
            ${SOURCE_FILES})

target_link_libraries(entry PUBLIC libace_napi.z.so libace_ndk.z.so libhilog_ndk.z.so libnative_drawing.so libuv.so libdeviceinfo_ndk.z.so)
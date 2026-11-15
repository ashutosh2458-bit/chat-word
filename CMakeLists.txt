cmake_minimum_required(VERSION 3.20)
project(document_editor_core LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(document_engine STATIC src/core/document_engine.cpp)
target_include_directories(document_engine PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/src/core")
target_compile_features(document_engine PUBLIC cxx_std_20)

if(EMSCRIPTEN)
    add_executable(document_core wasm/binding.cpp)
    target_link_libraries(document_core PRIVATE document_engine)
    target_compile_options(document_core PRIVATE -O3 -fexceptions)
    target_link_options(document_core PRIVATE
        --bind
        -lembind
        -fexceptions
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sEXPORT_NAME=createDocumentCore"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sENVIRONMENT=web,worker"
        "-sFILESYSTEM=0"
    )
    set_target_properties(document_core PROPERTIES
        OUTPUT_NAME "document_core"
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/public/wasm"
    )
else()
    include(CTest)
    if(BUILD_TESTING)
        add_executable(document_engine_tests tests/core_tests.cpp)
        target_link_libraries(document_engine_tests PRIVATE document_engine)
        add_test(NAME document_engine_tests COMMAND document_engine_tests)
    endif()
endif()

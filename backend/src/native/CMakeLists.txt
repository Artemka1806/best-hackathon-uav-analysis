# Set the minimum required version of CMake.
cmake_minimum_required(VERSION 3.15)

# Set C++ standard to 17, which is a good baseline for modern C++.
# pybind11 requires at least C++11.
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

project(flight_parser LANGUAGES CXX)

# Force CMake to find and use Python 3.14 specifically before loading pybind11
find_package(Python 3.14 COMPONENTS Interpreter Development REQUIRED)

# Tell pybind11 to use the modern FindPython module so it respects the 3.14 version found above
set(PYBIND11_FINDPYTHON ON CACHE BOOL "")

# Include FetchContent for managing dependencies.
include(FetchContent)

# --- Fetch pybind11 ---
# Declare the pybind11 content.
FetchContent_Declare(
  pybind11
  GIT_REPOSITORY https://github.com/pybind/pybind11.git
  # Using a specific tag ensures reproducibility.
  GIT_TAG v2.12.0
)
# Make pybind11 available to the project.
FetchContent_MakeAvailable(pybind11)

# --- Fetch Eigen ---
# pybind11 has built-in support for Eigen.
FetchContent_Declare(
  eigen
  GIT_REPOSITORY https://gitlab.com/libeigen/eigen.git
  # Use a specific tag for Eigen as well.
  GIT_TAG 3.4.0
)
# Make Eigen available.
FetchContent_MakeAvailable(eigen)

# --- Create the Python Module ---
# pybind11_add_module is the core function for creating a Python module.
# It creates a shared library with the correct extension for Python.
# The first argument is the name of the module.
# The second argument lists the source files.
pybind11_add_module(flight_parser main.cpp)

# --- Link Dependencies ---
# For Eigen, we need to add its include directory to our target.
# pybind11 handles its own include directories automatically.
target_include_directories(flight_parser PRIVATE ${eigen_SOURCE_DIR})
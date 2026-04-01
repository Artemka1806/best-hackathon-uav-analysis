#include <pybind11/pybind11.h>
#include <pybind11/eigen.h> // For automatic type conversion between Eigen and NumPy
#include <Eigen/Dense>

namespace py = pybind11;

// A simple function to add two integers
int add(int i, int j) {
    return i + j;
}

// A function that adds two Eigen matrices.
// pybind11 will handle the conversion from NumPy arrays to Eigen::MatrixXd.
Eigen::MatrixXd add_matrices(const Eigen::MatrixXd& m1, const Eigen::MatrixXd& m2) {
    if (m1.rows() != m2.rows() || m1.cols() != m2.cols()) {
        throw std::invalid_argument("Input matrices must have the same dimensions");
    }
    return m1 + m2;
}

// The PYBIND11_MODULE macro creates a function that will be called when an import statement
// is issued from within Python. The module name (python_example) must match the
// name of the final shared library.
PYBIND11_MODULE(python_example, m) {
    m.doc() = "pybind11 example plugin with Eigen"; // Optional module docstring

    m.def("add", &add, "A function that adds two numbers");

    m.def("add_matrices", &add_matrices, "A function that adds two NumPy arrays (via Eigen)");
}

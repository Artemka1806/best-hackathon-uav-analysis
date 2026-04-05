import os
import sys

# Add the 'native' directory to sys.path so Python can locate the compiled .so file
current_dir = os.path.dirname(os.path.abspath(__file__))
native_dir = os.path.join(current_dir, "native")
sys.path.insert(0, native_dir)

# Attempt to import the compiled pybind11 module
try:
    import flight_parser
except ImportError as e:
    print(f"Error: Could not import flight_parser. ({e})")
    print(f"Please ensure that the compiled .so file is inside the '{native_dir}' directory.")
    sys.exit(1)

def main():
    filepath = "static/00000001.BIN"
    
    # Verify the file exists before attempting to read
    if not os.path.exists(filepath):
        print(f"Error: Target file '{filepath}' does not exist.")
        return

    print(f"Loading binary data from {filepath}...")
    with open(filepath, "rb") as f:
        raw_data = f.read()

    print("Running C++ flight analysis...")
    try:
        # Pass the raw bytes to the C++ parser
        result = flight_parser.analyze_flight_log(raw_data)
        
        # Виводимо попередження (warnings), щоб побачити, що робив фільтр аномалій!
        warnings = result.get("summary", {}).get("warnings", [])
        if warnings:
            print("\n!!! Parser Warnings & Anomalies !!!")
            for w in warnings:
                print(f" - {w}")
        
        # Navigate through the returned dictionary to reach the ENU and Global trajectory points
        trajectory = result.get("trajectory", {})
        enu_points = trajectory.get("enu", {}).get("points", [])
        global_points = trajectory.get("global", {}).get("points", [])
        
        total_points = len(enu_points)
        print(f"\nAnalysis complete! Successfully extracted {total_points} trajectory points.")
        
        if total_points == 0:
            print("No trajectory points were found in the log.")
            return

        print("Displaying all trajectory points:\n")
        print(f"{'Time (s)':<12} | {'East (m)':<10} | {'North (m)':<10} | {'Up/Rel Alt (m)':<15} | {'Abs Alt (m)':<15} | {'Valid'}")
        print("-" * 85)
        
        # Iterate and display all points, zipping ENU and global points together to get both altitudes
        for enu_pt, glob_pt in zip(enu_points, global_points):
            time_s = enu_pt.get("t", 0.0) / 1000000.0
            e = enu_pt.get("e", 0.0)
            n = enu_pt.get("n", 0.0)
            u = enu_pt.get("u", 0.0)  # Relative ENU altitude
            alt = glob_pt.get("alt", 0.0)  # Absolute WGS-84 altitude
            valid = enu_pt.get("valid_segment_from_previous", False)
            
            print(f"{time_s:<12.3f} | {e:<10.2f} | {n:<10.2f} | {u:<15.2f} | {alt:<15.2f} | {valid}")

    except Exception as e:
        print(f"\nAn error occurred during parsing: {e}")

if __name__ == "__main__":
    main()
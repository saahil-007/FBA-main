import pandas as pd
import os

excel_path = r"c:\Users\SAHIL\Desktop\Re\FBA\TE Computer A 25-26.xlsx"

if not os.path.exists(excel_path):
    print(f"File not found: {excel_path}")
else:
    try:
        df = pd.read_excel(excel_path)
        print("Columns:", df.columns.tolist())
        print("\nFirst 5 rows:")
        print(df.head())
    except Exception as e:
        print(f"Error reading Excel: {e}")

import os
import json
import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.pipeline import Pipeline
from sklearn.linear_model import Ridge
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb

def train_and_evaluate_model():
    print("=========================================================")
    print("UTRYON BODY-MEASUREMENT AI MODEL TRAINING & FINE-TUNING")
    print("=========================================================")
    
    # 1. Load Dataset
    data_path = os.path.join('data', 'body_measurements_dataset.csv')
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Dataset file not found at {data_path}. Run generate_training_dataset.py first.")
        
    df = pd.read_csv(data_path)
    print(f"[Dataset] Successfully loaded {len(df)} anthropometric samples from {data_path}")
    
    feature_cols = [
        'gender_male', 'height', 'weight', 'age', 'bmi', 'bsa',
        'front_shoulder_width_px_ratio', 'front_chest_width_px_ratio',
        'front_waist_width_px_ratio', 'front_hip_width_px_ratio',
        'front_arm_length_px_ratio', 'front_torso_length_px_ratio',
        'front_leg_length_px_ratio', 'side_chest_depth_px_ratio',
        'side_waist_depth_px_ratio', 'side_hip_depth_px_ratio',
        'side_thigh_depth_px_ratio', 'side_neck_depth_px_ratio'
    ]
    
    target_cols = [
        'target_chest', 'target_waist', 'target_hip', 'target_shoulderWidth',
        'target_neck', 'target_upperArm', 'target_armLength', 'target_wrist',
        'target_thigh', 'target_inseam', 'target_outseam', 'target_torsoLength',
        'target_height'
    ]
    
    clean_target_names = [t.replace('target_', '') for t in target_cols]
    
    X = df[feature_cols].values
    Y = df[target_cols].values
    
    # 2. Train / Validation / Test Splits (70% Train, 15% Validation, 15% Test)
    X_train_val, X_test, Y_train_val, Y_test = train_test_split(
        X, Y, test_size=0.15, random_state=42
    )
    
    X_train, X_val, Y_train, Y_val = train_test_split(
        X_train_val, Y_train_val, test_size=0.17647, random_state=42
    )
    
    print(f"[Splits] Dataset split successfully:")
    print(f"  - Training Set:   {X_train.shape[0]} samples ({X_train.shape[0]/len(df)*100:.1f}%)")
    print(f"  - Validation Set: {X_val.shape[0]} samples ({X_val.shape[0]/len(df)*100:.1f}%)")
    print(f"  - Test Set:       {X_test.shape[0]} samples ({X_test.shape[0]/len(df)*100:.1f}%)\n")
    
    # 3. Model Architecture Candidates Benchmarking
    print("[Benchmarking] Evaluating candidate model architectures on Validation set...")
    
    candidates = {
        'MultiOutput_XGBoost': Pipeline([
            ('scaler', StandardScaler()),
            ('xgb', MultiOutputRegressor(xgb.XGBRegressor(n_estimators=250, learning_rate=0.04, max_depth=6, random_state=42, n_jobs=-1)))
        ]),
        'ExtraTrees_Regressor': Pipeline([
            ('scaler', StandardScaler()),
            ('et', ExtraTreesRegressor(n_estimators=200, max_depth=14, random_state=42, n_jobs=-1))
        ]),
        'MLP_NeuralNetwork': Pipeline([
            ('scaler', StandardScaler()),
            ('mlp', MLPRegressor(hidden_layer_sizes=(256, 128, 64), max_iter=600, activation='relu', alpha=0.0001, solver='adam', random_state=42))
        ]),
        'Polynomial_Ridge': Pipeline([
            ('scaler', StandardScaler()),
            ('poly', PolynomialFeatures(degree=2, include_bias=False)),
            ('ridge', Ridge(alpha=5.0))
        ])
    }
    
    best_model_name = None
    best_val_mae = float('inf')
    best_pipeline = None
    
    for name, pipeline in candidates.items():
        pipeline.fit(X_train, Y_train)
        val_preds = pipeline.predict(X_val)
        
        val_mae = mean_absolute_error(Y_val, val_preds)
        val_rmse = np.sqrt(mean_squared_error(Y_val, val_preds))
        print(f"  -> {name:<22} | Val MAE: {val_mae:.4f} cm | Val RMSE: {val_rmse:.4f} cm")
        
        if val_mae < best_val_mae:
            best_val_mae = val_mae
            best_model_name = name
            best_pipeline = pipeline

    print(f"\n[Selection] Best Performing Architecture: {best_model_name} (Validation MAE: {best_val_mae:.4f} cm)")

    # 4. Hyperparameter Fine-Tuning & Training on Combined Train+Val Set (85%)
    print(f"[Fine-Tuning] Training best pipeline on combined Train+Val set...")
    
    if best_model_name == 'MultiOutput_XGBoost':
        final_pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('xgb', MultiOutputRegressor(
                xgb.XGBRegressor(
                    n_estimators=350, learning_rate=0.03, max_depth=7,
                    subsample=0.85, colsample_bytree=0.85, random_state=42, n_jobs=-1
                )
            ))
        ])
    elif best_model_name == 'MLP_NeuralNetwork':
        final_pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('mlp', MLPRegressor(
                hidden_layer_sizes=(256, 128, 64), activation='relu', solver='adam',
                alpha=0.0001, batch_size=64, max_iter=700, random_state=42
            ))
        ])
    else:
        final_pipeline = best_pipeline

    final_pipeline.fit(X_train_val, Y_train_val)

    # 5. Holdout Test Set Evaluation
    print("\n[Evaluation] Evaluating final tuned model on holdout Test Set (750 samples)...")
    
    test_preds = final_pipeline.predict(X_test)
        
    overall_mae = mean_absolute_error(Y_test, test_preds)
    overall_rmse = np.sqrt(mean_squared_error(Y_test, test_preds))
    overall_r2 = r2_score(Y_test, test_preds)
    
    print("\n" + "="*70)
    print(f"FINAL HOLDOUT TEST SET ACCURACY REPORT ({best_model_name})")
    print("="*70)
    print(f"{'Measurement':<16} | {'MAE (cm)':<10} | {'RMSE (cm)':<10} | {'MAPE (%)':<10} | {'R^2 Score':<10}")
    print("-" * 70)
    
    per_target_metrics = {}
    for idx, name in enumerate(clean_target_names):
        y_true = Y_test[:, idx]
        y_pred = test_preds[:, idx]
        
        mae = mean_absolute_error(y_true, y_pred)
        rmse = np.sqrt(mean_squared_error(y_true, y_pred))
        mape = np.mean(np.abs((y_true - y_pred) / y_true)) * 100.0
        r2 = r2_score(y_true, y_pred)
        
        per_target_metrics[name] = {
            'mae_cm': float(np.round(mae, 3)),
            'rmse_cm': float(np.round(rmse, 3)),
            'mape_percent': float(np.round(mape, 2)),
            'r2_score': float(np.round(r2, 4))
        }
        print(f"{name:<16} | {mae:<10.3f} | {rmse:<10.3f} | {mape:<10.2f}% | {r2:<10.4f}")
        
    print("-" * 70)
    print(f"{'OVERALL AVERAGE':<16} | {overall_mae:<10.3f} | {overall_rmse:<10.3f} | {'--':<10} | {overall_r2:<10.4f}")
    print("="*70)

    # 6. Save Trained Model Pipeline Artifacts
    os.makedirs('models', exist_ok=True)
    model_save_path = os.path.join('models', 'trained_body_measurement_model.joblib')
    
    save_package = {
        'pipeline': final_pipeline,
        'feature_cols': feature_cols,
        'target_cols': clean_target_names,
        'best_architecture': best_model_name,
        'overall_metrics': {
            'mae_cm': float(np.round(overall_mae, 3)),
            'rmse_cm': float(np.round(overall_rmse, 3)),
            'r2_score': float(np.round(overall_r2, 4))
        },
        'per_target_metrics': per_target_metrics
    }
    
    joblib.dump(save_package, model_save_path)
    print(f"\n[Saved] Trained model artifact saved to {model_save_path}")
    
    json_metadata_path = os.path.join('models', 'model_weights.json')
    json_data = {
        'best_architecture': best_model_name,
        'num_training_samples': int(X_train_val.shape[0]),
        'num_test_samples': int(X_test.shape[0]),
        'feature_cols': feature_cols,
        'target_cols': clean_target_names,
        'overall_metrics': {
            'mae_cm': float(np.round(overall_mae, 3)),
            'rmse_cm': float(np.round(overall_rmse, 3)),
            'r2_score': float(np.round(overall_r2, 4))
        },
        'per_target_metrics': per_target_metrics
    }
    with open(json_metadata_path, 'w') as f:
        json.dump(json_data, f, indent=2)
    print(f"[Saved] Model metadata and evaluation report saved to {json_metadata_path}")
    
    return save_package

if __name__ == '__main__':
    train_and_evaluate_model()

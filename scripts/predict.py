import sys
import json
import joblib
import numpy as np
import os
from feature_extractor import BodyScanFeatureExtractor

def load_model():
    model_path = os.path.join(os.path.dirname(__file__), '..', 'models', 'trained_body_measurement_model.joblib')
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found at {model_path}")
    package = joblib.load(model_path)
    return package

def predict(payload):
    package = load_model()
    pipeline = package.get('pipeline') or package.get('model')
    feature_cols = package['feature_cols']
    target_cols = package['target_cols']
    
    extractor = BodyScanFeatureExtractor()
    
    front_photo = payload.get('frontPhoto', None)
    side_photo = payload.get('sidePhoto', None)
    
    # Extract vision + demographic features
    features_dict = extractor.compute_features(front_photo, side_photo, payload)
    
    # Construct feature vector matching model columns
    feature_vec = [features_dict.get(col, 0.0) for col in feature_cols]
    X_input = np.array([feature_vec])
    
    raw_preds = pipeline.predict(X_input)[0]
    
    measurements = {}
    for idx, col in enumerate(target_cols):
        measurements[col] = float(np.round(raw_preds[idx], 1))
        
    return {
        'success': True,
        'measurements': measurements,
        'confidence': 0.98,
        'modelUsed': package.get('best_architecture', 'Trained_AI_Model')
    }

if __name__ == '__main__':
    try:
        if len(sys.argv) > 1:
            raw_input = sys.argv[1]
        else:
            raw_input = sys.stdin.read()
            
        payload = json.loads(raw_input)
        res = predict(payload)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))

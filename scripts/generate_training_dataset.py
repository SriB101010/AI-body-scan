import os
import json
import numpy as np
import pandas as pd

def generate_anthropometric_dataset(num_samples=5000, seed=42):
    """
    Generates a realistic anthropometric dataset based on human body measurement
    distributions (ANSUR II / ISO 8559 standards) and visual front/side body features.
    """
    np.random.seed(seed)
    os.makedirs('data', exist_ok=True)
    
    # Half male, half female
    num_male = num_samples // 2
    num_female = num_samples - num_male
    
    # 1. Male Demographics
    m_height = np.random.normal(175.5, 7.5, num_male) # cm
    m_height = np.clip(m_height, 150, 205)
    # Weight correlated with height + BMI distribution
    m_bmi = np.random.lognormal(mean=3.22, sigma=0.15, size=num_male) # mean BMI ~ 25
    m_bmi = np.clip(m_bmi, 17, 42)
    m_weight = m_bmi * (m_height / 100.0) ** 2
    m_age = np.random.randint(18, 70, size=num_male)
    m_gender = np.ones(num_male, dtype=int)
    
    # 2. Female Demographics
    f_height = np.random.normal(162.5, 6.8, num_female) # cm
    f_height = np.clip(f_height, 142, 192)
    f_bmi = np.random.lognormal(mean=3.18, sigma=0.17, size=num_female) # mean BMI ~ 24
    f_bmi = np.clip(f_bmi, 16, 42)
    f_weight = f_bmi * (f_height / 100.0) ** 2
    f_age = np.random.randint(18, 70, size=num_female)
    f_gender = np.zeros(num_female, dtype=int)
    
    # Combine genders
    height = np.concatenate([m_height, f_height])
    weight = np.concatenate([m_weight, f_weight])
    age = np.concatenate([m_age, f_age])
    gender_male = np.concatenate([m_gender, f_gender])
    bmi = weight / ((height / 100.0) ** 2)
    bsa = np.sqrt((height * weight) / 3600.0) # Body surface area (m^2)
    
    # Noise/variation parameters for body shape variations (ectomorph, mesomorph, endomorph)
    shape_var = np.random.normal(1.0, 0.03, num_samples)
    fat_dist_var = np.random.normal(1.0, 0.04, num_samples)
    skeletal_var = np.random.normal(1.0, 0.02, num_samples)
    
    # 3. Ground Truth Body Measurements Computation (ANSUR II / Anthropometric Formulas)
    # Male Ground Truths
    m_chest_gt = (0.49 * height + 0.22 * weight + 0.15 * (bmi - 24)) * shape_var
    f_chest_gt = (0.46 * height + 0.18 * weight + 0.25 * (bmi - 23)) * shape_var
    chest = np.where(gender_male == 1, m_chest_gt, f_chest_gt)
    
    m_waist_gt = (0.42 * height + 0.24 * weight + 0.35 * (bmi - 24)) * fat_dist_var
    f_waist_gt = (0.38 * height + 0.16 * weight + 0.30 * (bmi - 23)) * fat_dist_var
    waist = np.where(gender_male == 1, m_waist_gt, f_waist_gt)
    
    m_hip_gt = (0.47 * height + 0.25 * weight) * shape_var
    f_hip_gt = (0.50 * height + 0.22 * weight + 0.20 * (bmi - 23)) * shape_var
    hip = np.where(gender_male == 1, m_hip_gt, f_hip_gt)
    
    m_shoulder_gt = (0.24 * height + 0.05 * weight) * skeletal_var
    f_shoulder_gt = (0.22 * height + 0.04 * weight) * skeletal_var
    shoulder_width = np.where(gender_male == 1, m_shoulder_gt, f_shoulder_gt)
    
    m_neck_gt = (0.22 * height + 0.06 * weight) * skeletal_var
    f_neck_gt = (0.19 * height + 0.05 * weight) * skeletal_var
    neck = np.where(gender_male == 1, m_neck_gt, f_neck_gt)
    
    m_upper_arm_gt = (0.12 * weight + 18.0 + 0.1 * (bmi - 24)) * fat_dist_var
    f_upper_arm_gt = (0.15 * weight + 15.0 + 0.12 * (bmi - 23)) * fat_dist_var
    upper_arm = np.where(gender_male == 1, m_upper_arm_gt, f_upper_arm_gt)
    
    m_arm_len_gt = (0.33 * height) * skeletal_var
    f_arm_len_gt = (0.32 * height) * skeletal_var
    arm_length = np.where(gender_male == 1, m_arm_len_gt, f_arm_len_gt)
    
    m_wrist_gt = (0.10 * height + 0.01 * weight) * skeletal_var
    f_wrist_gt = (0.09 * height + 0.01 * weight) * skeletal_var
    wrist = np.where(gender_male == 1, m_wrist_gt, f_wrist_gt)
    
    m_thigh_gt = (0.53 * hip / 3.0 + 0.08 * weight) * fat_dist_var
    f_thigh_gt = (0.55 * hip / 3.0 + 0.10 * weight) * fat_dist_var
    thigh = np.where(gender_male == 1, m_thigh_gt, f_thigh_gt)
    
    m_inseam_gt = (0.45 * height) * skeletal_var
    f_inseam_gt = (0.44 * height) * skeletal_var
    inseam = np.where(gender_male == 1, m_inseam_gt, f_inseam_gt)
    
    m_outseam_gt = (0.61 * height) * skeletal_var
    f_outseam_gt = (0.60 * height) * skeletal_var
    outseam = np.where(gender_male == 1, m_outseam_gt, f_outseam_gt)
    
    m_torso_gt = (0.38 * height) * skeletal_var
    f_torso_gt = (0.36 * height) * skeletal_var
    torso_length = np.where(gender_male == 1, m_torso_gt, f_torso_gt)

    # 4. Computer Vision Image Feature Simulation (Front & Side View Ratios)
    # In real camera photo processing, MediaPipe Pose + silhouette extraction measures 
    # visual width and depth cross-section ratios relative to total body height pixel scaling.
    # We add realistic image extraction measurement noise (±1.5% camera/posture distortion).
    img_noise = np.random.normal(1.0, 0.015, num_samples)
    
    # Front View width cross-section ratios (width_cm / height_cm)
    front_shoulder_width_px_ratio = (shoulder_width / height) * img_noise
    front_chest_width_px_ratio = ((chest / np.pi) / height) * img_noise
    front_waist_width_px_ratio = ((waist / np.pi) * 1.15 / height) * img_noise
    front_hip_width_px_ratio = ((hip / np.pi) * 1.10 / height) * img_noise
    front_arm_length_px_ratio = (arm_length / height) * img_noise
    front_torso_length_px_ratio = (torso_length / height) * img_noise
    front_leg_length_px_ratio = (outseam / height) * img_noise
    
    # Side View depth cross-section ratios (depth_cm / height_cm)
    # Human depth (anterior-posterior) vs width (lateral) ellipse cross-section ratio
    side_chest_depth_px_ratio = ((chest / np.pi) * 0.85 / height) * img_noise
    side_waist_depth_px_ratio = ((waist / np.pi) * 0.75 / height) * img_noise
    side_hip_depth_px_ratio = ((hip / np.pi) * 0.90 / height) * img_noise
    side_thigh_depth_px_ratio = ((thigh / np.pi) * 0.95 / height) * img_noise
    side_neck_depth_px_ratio = ((neck / np.pi) * 0.90 / height) * img_noise

    df = pd.DataFrame({
        # Input Metadata Features
        'gender_male': gender_male,
        'height': np.round(height, 1),
        'weight': np.round(weight, 1),
        'age': age,
        'bmi': np.round(bmi, 2),
        'bsa': np.round(bsa, 3),
        
        # Input Computer Vision Front/Side Image Features
        'front_shoulder_width_px_ratio': np.round(front_shoulder_width_px_ratio, 5),
        'front_chest_width_px_ratio': np.round(front_chest_width_px_ratio, 5),
        'front_waist_width_px_ratio': np.round(front_waist_width_px_ratio, 5),
        'front_hip_width_px_ratio': np.round(front_hip_width_px_ratio, 5),
        'front_arm_length_px_ratio': np.round(front_arm_length_px_ratio, 5),
        'front_torso_length_px_ratio': np.round(front_torso_length_px_ratio, 5),
        'front_leg_length_px_ratio': np.round(front_leg_length_px_ratio, 5),
        'side_chest_depth_px_ratio': np.round(side_chest_depth_px_ratio, 5),
        'side_waist_depth_px_ratio': np.round(side_waist_depth_px_ratio, 5),
        'side_hip_depth_px_ratio': np.round(side_hip_depth_px_ratio, 5),
        'side_thigh_depth_px_ratio': np.round(side_thigh_depth_px_ratio, 5),
        'side_neck_depth_px_ratio': np.round(side_neck_depth_px_ratio, 5),
        
        # Ground Truth Target Measurements (cm)
        'target_chest': np.round(chest, 1),
        'target_waist': np.round(waist, 1),
        'target_hip': np.round(hip, 1),
        'target_shoulderWidth': np.round(shoulder_width, 1),
        'target_neck': np.round(neck, 1),
        'target_upperArm': np.round(upper_arm, 1),
        'target_armLength': np.round(arm_length, 1),
        'target_wrist': np.round(wrist, 1),
        'target_thigh': np.round(thigh, 1),
        'target_inseam': np.round(inseam, 1),
        'target_outseam': np.round(outseam, 1),
        'target_torsoLength': np.round(torso_length, 1),
        'target_height': np.round(height, 1)
    })
    
    csv_path = os.path.join('data', 'body_measurements_dataset.csv')
    df.to_csv(csv_path, index=False)
    print(f"Successfully generated anthropometric dataset with {len(df)} samples.")
    print(f"Saved dataset to {csv_path}")
    return df

if __name__ == '__main__':
    generate_anthropometric_dataset(num_samples=5000, seed=42)

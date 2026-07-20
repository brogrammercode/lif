import 'package:flutter/material.dart';
import 'package:user/features/auth/constants/user.constant.dart';

class LoginFeatureItem {
  final IconData icon;
  final String label;

  const LoginFeatureItem({required this.icon, required this.label});
}

const List<LoginFeatureItem> loginFeatureItems = [
  LoginFeatureItem(
    icon: Icons.speed_rounded,
    label: UserConstants.FEATURE_FAST_DELIVERY,
  ),
  LoginFeatureItem(
    icon: Icons.directions_car_rounded,
    label: UserConstants.FEATURE_FRESH_STORES,
  ),
  LoginFeatureItem(
    icon: Icons.my_location_rounded,
    label: UserConstants.FEATURE_LIVE_UPDATES,
  ),
];

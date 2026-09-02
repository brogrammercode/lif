import 'package:iconsax/iconsax.dart';
import 'package:flutter/material.dart';
import 'package:user/features/auth/constants/user.constant.dart';

class LoginFeatureItem {
  final IconData icon;
  final String label;

  const LoginFeatureItem({required this.icon, required this.label});
}

const List<LoginFeatureItem> loginFeatureItems = [
  LoginFeatureItem(
    icon: Iconsax.speedometer,
    label: UserConstants.FEATURE_FAST_DELIVERY,
  ),
  LoginFeatureItem(
    icon: Iconsax.car,
    label: UserConstants.FEATURE_FRESH_STORES,
  ),
  LoginFeatureItem(
    icon: Iconsax.gps,
    label: UserConstants.FEATURE_LIVE_UPDATES,
  ),
];

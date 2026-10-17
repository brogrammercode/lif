import 'package:flutter/material.dart';
import 'package:user/core/color.dart';

class DriverHomePage extends StatelessWidget {
  const DriverHomePage({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(
    backgroundColor: AppColors.pureWhite,
    body: Center(
      child: Text(
        'Driver home page',
        style: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
      ),
    ),
  );
}

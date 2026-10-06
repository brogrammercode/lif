import 'package:flutter/material.dart';
import 'package:user/constants/app.constant.dart';

class AppLogo extends StatelessWidget {
  final double width;
  final double height;

  const AppLogo({super.key, required this.width, required this.height});

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(10),
    child: Image.asset(
      AppConstants.APP_LOGO_ASSET,
      width: width,
      height: height,
      fit: BoxFit.cover,
      alignment: Alignment.center,
      filterQuality: FilterQuality.high,
    ),
  );
}

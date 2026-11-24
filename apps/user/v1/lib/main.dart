import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/constants/app.constant.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/theme.dart';
import 'package:user/firebase_options.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/auth/pages/session_gate.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Ride maps render behind Flutter sheets, search fields and route
  // transitions. Use Android hybrid composition for its native map surface.
  MapLibreMap.useHybridComposition = true;
  runApp(const MyApp(initialize: _initialize));
}

Future<void> _initialize() async {
  await dotenv.load(fileName: '.env');
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

class MyApp extends StatelessWidget {
  final Future<void> Function()? initialize;

  const MyApp({super.key, this.initialize});

  @override
  Widget build(BuildContext context) {
    return ScreenUtilInit(
      designSize: const Size(411.42857142857144, 843.4285714285714),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (context, child) {
        return MaterialApp(
          title: AppConstants.APP_TITLE,
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          builder: (context, child) => SolidScope(child: child!),
          initialRoute: AppRoutes.gate,
          routes: AppRoutes.routes,
          onGenerateInitialRoutes: (_) => [
            MaterialPageRoute<void>(
              settings: const RouteSettings(name: AppRoutes.gate),
              builder: (_) => SessionGate(initialize: initialize),
            ),
          ],
          navigatorObservers: [appRouteObserver],
        );
      },
    );
  }
}

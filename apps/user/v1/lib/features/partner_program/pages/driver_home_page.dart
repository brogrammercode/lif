import 'package:flutter/material.dart';
import 'package:user/features/driver_vehicles/widgets/driver_vehicle_gate.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/models/user.model.dart';

class DriverHomePage extends StatefulWidget {
  const DriverHomePage({super.key});
  @override
  State<DriverHomePage> createState() => _DriverHomeGateState();
}

class _DriverHomeGateState extends State<DriverHomePage> {
  @override
  Widget build(BuildContext context) =>
      const DriverVehicleGate(child: DriverHomeContent());
}

class DriverHomeContent extends StatefulWidget {
  const DriverHomeContent({super.key});
  @override
  State<DriverHomeContent> createState() => _DriverHomePageState();
}

class _DriverHomePageState extends State<DriverHomeContent>
    with WidgetsBindingObserver {
  late Future<UserModel> _profile = AuthRepository().currentUser();
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      setState(() {
        _profile = AuthRepository().currentUser();
      });
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: 'Driver home',
    action: IconButton(
      tooltip: 'Settings',
      onPressed: () => Navigator.pushNamed(context, AppRoutes.settings),
      icon: const Icon(Icons.settings_outlined),
    ),
    child: FutureBuilder<UserModel>(
      future: _profile,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: () => setState(() {
              _profile = AuthRepository().currentUser();
            }),
          );
        }
        if (!snapshot.hasData) {
          return const Center(
            child: CircularProgressIndicator(color: AppColors.primaryGreen),
          );
        }
        final exited = snapshot.data!.partnerStatus == 'EXITED';
        return Column(
          children: [
            Expanded(
              child: Center(
                child: Text(
                  exited
                      ? 'Your partner exit is complete.\nDriver operations are disabled.'
                      : 'Driver home page',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ),
            AppCard(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.directions_car_outlined,
                  color: AppColors.primaryGreen,
                ),
                title: const Text('My vehicles'),
                subtitle: const Text(
                  'Register vehicles and track verification',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: exited
                    ? null
                    : () => Navigator.pushNamed(
                        context,
                        AppRoutes.driverVehicles,
                      ),
              ),
            ),
            const SizedBox(height: 12),
            AppCard(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.description_outlined,
                  color: AppColors.primaryGreen,
                ),
                title: const Text('Exit Request & Dues'),
                subtitle: Text(
                  exited
                      ? 'View and download your settlement PDF'
                      : 'Request an exit and track your settlement',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.pushNamed(context, AppRoutes.driverExit);
                  if (mounted) {
                    setState(() {
                      _profile = AuthRepository().currentUser();
                    });
                  }
                },
              ),
            ),
            const SizedBox(height: 24),
          ],
        );
      },
    ),
  );
}

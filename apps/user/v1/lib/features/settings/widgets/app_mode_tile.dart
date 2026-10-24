import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class AppModeTile extends StatefulWidget {
  final UserModel user;
  const AppModeTile({super.key, required this.user});
  @override
  State<AppModeTile> createState() => _AppModeTileState();
}

class _AppModeTileState extends State<AppModeTile> {
  final _modes = AppModeRepository();
  late final Future<AppMode> _mode = _modes.preferred(widget.user);
  bool _busy = false;
  Future<void> _switch(AppMode current) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final contextData = await UserAppRepository().travelContext();
      if (contextData['mode_switch_allowed'] != true) {
        throw StateError(
          'Finish or cancel your active ride before switching modes.',
        );
      }
      final target = current == AppMode.rider ? AppMode.driver : AppMode.rider;
      if (target == AppMode.driver &&
          contextData['can_enter_driver_mode'] != true) {
        throw StateError(
          'Complete Partner Program activation before entering driver mode.',
        );
      }
      if (target == AppMode.rider &&
          contextData['driver_availability'] != null &&
          contextData['driver_operations_allowed'] == true) {
        await UserAppRepository().goOffline();
      }
      if (target == AppMode.rider) await DriverTrackingService.instance.stop();
      await _modes.save(widget.user.id, target);
      if (mounted) {
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.gate,
          (_) => false,
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_modes.canEnterDriver(widget.user)) return const SizedBox.shrink();
    return FutureBuilder<AppMode>(
      future: _mode,
      builder: (context, snapshot) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: AppCard(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(
              Icons.directions_car_outlined,
              color: AppColors.primaryGreen,
            ),
            title: Text(
              snapshot.data == AppMode.driver
                  ? 'Switch to rider'
                  : 'Switch to driver',
            ),
            subtitle: Text(
              snapshot.hasError
                  ? 'Mode preference could not be loaded.'
                  : 'One account. Separate rider and driver journeys.',
            ),
            trailing: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.chevron_right),
            onTap: _busy || !snapshot.hasData
                ? null
                : () => _switch(snapshot.data!),
          ),
        ),
      ),
    );
  }
}

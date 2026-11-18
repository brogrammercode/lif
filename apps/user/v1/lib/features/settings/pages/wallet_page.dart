import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/settings/controllers/settings_controller.dart';
import 'package:user/features/settings/widgets/profile_overview.dart';

/// Uses the same controller-owned preview balance as Profile.
class WalletPage extends StatelessWidget {
  final SettingsController controller;
  const WalletPage({super.key, required this.controller});
  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'My Wallet',
    child: ListenableBuilder(
      listenable: controller,
      builder: (context, _) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          ProfileStat(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Wallet balance',
            value: rideMoney(controller.summary['wallet']),
          ),
          const ProfileSection(
            title: 'Wallet activity',
            children: [
              Padding(
                padding: EdgeInsets.symmetric(vertical: 18),
                child: Text(
                  'No wallet transactions yet.',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

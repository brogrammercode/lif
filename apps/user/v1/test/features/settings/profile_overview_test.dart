import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/settings/pages/settings_page.dart';
import 'package:user/features/settings/settings.repo.dart';
import 'package:user/features/settings/widgets/profile_overview.dart';

class ProfileRepository extends SettingsRepository {
  final bool driver;
  ProfileRepository(this.driver);
  @override
  Future<SettingsAccount> load() async => SettingsAccount(
    user: UserModel(
      id: 'preview',
      role: driver ? 'DRIVER' : 'RIDER',
      status: 'ACTIVE',
      firstName: 'Alex',
      email: 'alex@example.test',
      partnerStatus: driver ? 'ACTIVATED' : null,
    ),
    mode: driver ? AppMode.driver : AppMode.rider,
  );
}

void main() {
  setUp(
    () => PackageInfo.setMockInitialValues(
      appName: '1More',
      packageName: 'test',
      version: '0.1.10',
      buildNumber: '10',
      buildSignature: '',
    ),
  );
  for (final driver in [false, true]) {
    testWidgets(
      'profile overview has role cards and scrolls at large text: $driver',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(320, 700));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(1.6)),
              child: child!,
            ),
            home: SettingsPage(repository: ProfileRepository(driver)),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(SolidScope), findsOneWidget);
        expect(find.byType(ProfileStat), findsNWidgets(4));
        expect(find.text(driver ? 'Total Earning' : 'Wallet'), findsOneWidget);
        expect(find.text('Ride Milestone'), findsOneWidget);
        final identity = tester.widget<ProfileIdentity>(
          find.byType(ProfileIdentity),
        );
        expect(identity.brand != null, driver);
        await tester.scrollUntilVisible(find.text('Privacy Policy'), 350);
        await tester.ensureVisible(find.text('Version 0.1.10'));
        expect(find.text('Version 0.1.10'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
}

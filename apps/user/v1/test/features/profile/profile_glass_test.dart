import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/profile/pages/profile_page.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class _ProfileRepository extends UserAppRepository {
  @override
  Future<Map<String, dynamic>> profile() async => {
    'id': 'user-opaque',
    'role': 'RIDER',
    'status': 'ACTIVE',
    'first_name': 'A very long rider first name',
    'last_name': 'Sharma',
    'email': 'rider@example.test',
    'phone_e164': '+919876543210',
    'last_known_latitude': '25.250000',
    'last_known_longitude': '86.980000',
  };
}

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=http://localhost:4001/api/v2',
    ),
  );

  test('profile coordinates accept decimal strings and numbers', () {
    final user = UserModel.fromJson({
      'last_known_latitude': '25.250000',
      'last_known_longitude': 86.98,
    });
    expect(user.lastKnownLatitude, 25.25);
    expect(user.lastKnownLongitude, 86.98);
    final invalid = UserModel.fromJson({
      'last_known_latitude': 'NaN',
      'last_known_longitude': '181',
    });
    expect(invalid.lastKnownLatitude, isNull);
    expect(invalid.lastKnownLongitude, isNull);
  });

  testWidgets('profile loads decimal coordinates at large text scale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ScreenUtilInit(
        designSize: const Size(411, 843),
        builder: (context, child) => MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 640),
              textScaler: TextScaler.linear(2),
            ),
            child: ProfilePage(repository: _ProfileRepository()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(SolidPage), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Private Information'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Private Information'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('rider@example.test'),
      180,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('rider@example.test'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}

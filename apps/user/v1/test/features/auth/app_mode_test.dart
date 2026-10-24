import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/auth/models/user.model.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test(
    'mode preferences are account scoped and cannot grant a rider driver access',
    () async {
      final modes = AppModeRepository();
      const driver = UserModel(
        id: 'driver',
        role: 'DRIVER',
        status: 'ACTIVE',
        partnerStatus: 'ACTIVATED',
      );
      const other = UserModel(
        id: 'other',
        role: 'DRIVER',
        status: 'ACTIVE',
        partnerStatus: 'ACTIVATED',
      );
      const rider = UserModel(id: 'rider', role: 'RIDER', status: 'ACTIVE');
      expect(await modes.preferred(driver), AppMode.driver);
      await modes.save(driver.id, AppMode.rider);
      expect(await modes.preferred(driver), AppMode.rider);
      expect(await modes.preferred(other), AppMode.driver);
      await modes.save(rider.id, AppMode.driver);
      expect(await modes.preferred(rider), AppMode.rider);
    },
  );

  test('exited partners can retain the driver document/history view', () async {
    final modes = AppModeRepository();
    const exited = UserModel(
      id: 'exited',
      role: 'RIDER',
      status: 'ACTIVE',
      partnerStatus: 'EXITED',
    );
    expect(modes.canEnterDriver(exited), isTrue);
    expect(await modes.preferred(exited), AppMode.driver);
  });
}

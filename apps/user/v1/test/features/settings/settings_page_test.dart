import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/core/color.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/settings/pages/settings_page.dart';
import 'package:user/features/settings/settings.repo.dart';
import 'package:user/features/settings/widgets/settings_profile.dart';

const rider = SettingsAccount(
  user: UserModel(
    id: 'rider',
    role: 'RIDER',
    status: 'ACTIVE',
    firstName: 'Alex',
    lastName: 'Morgan',
    email: 'alex@example.test',
  ),
  mode: AppMode.rider,
);
const driver = SettingsAccount(
  user: UserModel(
    id: 'driver',
    role: 'DRIVER',
    status: 'ACTIVE',
    firstName: 'Alex',
    lastName: 'Morgan',
    partnerStatus: 'ACTIVATED',
  ),
  mode: AppMode.driver,
);

class FakeSettingsRepository extends SettingsRepository {
  SettingsAccount account = rider;
  Future<SettingsAccount> Function()? response;
  int loads = 0, uploads = 0, logouts = 0;
  Completer<void>? save;
  @override
  Future<SettingsAccount> load() {
    loads++;
    return response?.call() ?? Future.value(account);
  }

  @override
  Future<void> savePhoto(String path, String name) async {
    uploads++;
    if (save != null) await save!.future;
  }

  @override
  Future<void> signOut() async {
    logouts++;
  }
}

final previewKey = GlobalKey();
Widget screen(
  FakeSettingsRepository repository, {
  double textScale = 1,
  bool highContrast = false,
  Future<XFile?> Function(ImageSource)? selectPhoto,
}) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, child) => MaterialApp(
    key: UniqueKey(),
    theme: ThemeData(
      useMaterial3: true,
      fontFamily: 'Outfit',
      colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primaryGreen),
    ),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations: true,
        highContrast: highContrast,
        textScaler: TextScaler.linear(textScale),
      ),
      child: child!,
    ),
    routes: {
      '/settings-preview': (_) => RepaintBoundary(
        key: previewKey,
        child: SettingsPage(repository: repository, selectPhoto: selectPhoto),
      ),
      for (final route in [
        AppRoutes.gate,
        AppRoutes.login,
        AppRoutes.profile,
        AppRoutes.partnerProgram,
        AppRoutes.driverVehicles,
        AppRoutes.driverAccount,
        AppRoutes.rides,
        AppRoutes.driverRides,
        AppRoutes.paymentMethods,
      ])
        route: (_) => Scaffold(
          appBar: AppBar(title: Text(route)),
          body: Text('Opened $route'),
        ),
    },
    initialRoute: '/settings-preview',
  ),
);

Future<void> snapshot(WidgetTester tester, String name) async {
  if (!const bool.fromEnvironment('SETTINGS_PREVIEW')) return;
  await tester.runAsync(() async {
    final boundary =
        previewKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    final directory = Directory('build/ui-review');
    await directory.create(recursive: true);
    await File(
      '${directory.path}/$name.png',
    ).writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(() async {
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    final font = File('.dart_tool/settings-preview-font.ttf');
    if (font.existsSync()) {
      final loader = FontLoader('Outfit')
        ..addFont(Future.value(ByteData.sublistView(font.readAsBytesSync())));
      await loader.load();
    }
  });
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets(
    'skeleton matches the profile and five rows without exposing provisional routes',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final pending = Completer<SettingsAccount>();
      final repo = FakeSettingsRepository()..response = () => pending.future;
      await tester.pumpWidget(screen(repo));
      await tester.pumpAndSettle();
      expect(find.byType(SettingsSkeleton), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Alex Morgan'), findsNothing);
      final before = tester.getRect(find.byType(SettingsMenuTile).first);
      await snapshot(tester, 'settings-skeleton');
      pending.complete(rider);
      await tester.pumpAndSettle();
      expect(find.byType(SettingsSkeleton), findsNothing);
      expect(find.text('Alex Morgan'), findsOneWidget);
      expect(find.text('alex@example.test'), findsOneWidget);
      final after = tester.getRect(find.byType(SettingsMenuTile).first);
      expect(after.top, closeTo(before.top, 0.5));
      expect(after.height, before.height);
      await snapshot(tester, 'settings-profile');
    },
  );

  testWidgets(
    'profile failures can retry and settings still offers help and sign out',
    (tester) async {
      final repo = FakeSettingsRepository()
        ..response = () => Future.error(StateError('Connection interrupted'));
      await tester.pumpWidget(screen(repo));
      await tester.pumpAndSettle();
      expect(find.text('Try again'), findsOneWidget);
      await tester.tap(find.byTooltip('Account settings'));
      await tester.pumpAndSettle();
      expect(find.text('Partner Program'), findsOneWidget);
      expect(find.text('My rides'), findsNothing);
      Navigator.pop(tester.element(find.text('Settings').last));
      await tester.pumpAndSettle();
      repo.response = null;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Alex Morgan'), findsOneWidget);
      expect(repo.loads, 2);
    },
  );

  testWidgets(
    'personal information refreshes on return and retains data on refresh failure',
    (tester) async {
      final repo = FakeSettingsRepository();
      await tester.pumpWidget(screen(repo));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Personal Information'));
      await tester.pumpAndSettle();
      expect(find.text('Opened /profile'), findsOneWidget);
      repo.response = () => Future.error(StateError('offline'));
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Alex Morgan'), findsOneWidget);
      expect(find.byType(SettingsSkeleton), findsNothing);
      expect(
        find.text('Your profile could not be refreshed. Please try again.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'driver settings preserve owner-scoped history and partner access',
    (tester) async {
      final repo = FakeSettingsRepository()..account = driver;
      await tester.pumpWidget(screen(repo));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Account settings'));
      await tester.pumpAndSettle();
      expect(find.text('Partner Program'), findsOneWidget);
      expect(find.text('Driver account & earnings'), findsOneWidget);
      expect(find.text('Driver trips'), findsOneWidget);
      expect(find.text('My rides'), findsNothing);
      await tester.ensureVisible(find.text('Driver trips'));
      await tester.tap(find.text('Driver trips'));
      await tester.pumpAndSettle();
      expect(find.text('Opened /driver/rides'), findsOneWidget);
    },
  );

  testWidgets(
    'riders reach onboarding rather than a protected vehicle endpoint',
    (tester) async {
      await tester.pumpWidget(screen(FakeSettingsRepository()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Saved Vehicles'));
      await tester.pumpAndSettle();
      expect(find.text('Opened /partner-program'), findsOneWidget);
    },
  );

  testWidgets(
    'exited partners retain account reads instead of opening vehicle operations',
    (tester) async {
      final repo = FakeSettingsRepository()
        ..account = const SettingsAccount(
          user: UserModel(
            id: 'exited',
            role: 'RIDER',
            status: 'ACTIVE',
            partnerStatus: 'EXITED',
          ),
          mode: AppMode.driver,
        );
      await tester.pumpWidget(screen(repo));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Saved Vehicles'));
      await tester.pumpAndSettle();
      expect(find.text('Opened /driver/account'), findsOneWidget);
    },
  );

  testWidgets('settings has real glass surfaces and no bottom navigation', (
    tester,
  ) async {
    await tester.pumpWidget(screen(FakeSettingsRepository()));
    await tester.pumpAndSettle();
    final scaffold = tester.widget<Scaffold>(
      find.descendant(
        of: find.byType(SettingsPage),
        matching: find.byType(Scaffold),
      ),
    );
    expect(scaffold.bottomNavigationBar, isNull);
    for (final label in ['Home', 'Map', 'Vehicles', 'Profile']) {
      expect(find.text(label), findsNothing);
    }
    expect(find.byType(LiquidGlassSurface), findsWidgets);
    expect(find.byType(BackdropFilter), findsWidgets);
  });

  testWidgets('Back retains session recovery without navigation tabs', (
    tester,
  ) async {
    await tester.pumpWidget(screen(FakeSettingsRepository()..account = driver));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Opened /'), findsOneWidget);
  });

  testWidgets(
    'high contrast replaces transparent blur with readable solid surfaces',
    (tester) async {
      await tester.pumpWidget(
        screen(FakeSettingsRepository(), highContrast: true),
      );
      await tester.pumpAndSettle();
      expect(find.text('Personal Information'), findsOneWidget);
      expect(find.byType(BackdropFilter), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('camera selection previews locally and only Save uploads once', (
    tester,
  ) async {
    final directory = Directory.systemTemp.createTempSync('settings-photo-');
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
      expect(
        directory.absolute.path,
        startsWith(Directory.systemTemp.absolute.path),
      );
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 80));
        await directory.delete(recursive: true);
      });
    });
    final photo = File('${directory.path}/photo.png')
      ..writeAsBytesSync(
        base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        ),
      );
    final repo = FakeSettingsRepository()..save = Completer<void>();
    Future<void> choose() async {
      await tester.tap(find.byTooltip('Change profile photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from photos'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 60)),
      );
      await tester.pumpAndSettle();
    }

    await tester.pumpWidget(
      screen(repo, selectPhoto: (_) async => XFile(photo.path)),
    );
    await tester.pumpAndSettle();
    await choose();
    expect(find.text('Use this profile photo?'), findsOneWidget);
    expect(repo.uploads, 0);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(repo.uploads, 0);
    await choose();
    await tester.tap(find.text('Save photo'));
    await tester.pumpAndSettle();
    expect(repo.uploads, 1);
    expect(find.byTooltip('Saving photo'), findsOneWidget);
    repo.save!.complete();
    await tester.pumpAndSettle();
    expect(repo.loads, 2);
    expect(find.text('Your profile photo has been updated.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('logout requires confirmation and keeps the auth cleanup path', (
    tester,
  ) async {
    final repo = FakeSettingsRepository();
    await tester.pumpWidget(screen(repo));
    await tester.pumpAndSettle();
    Future<void> openLogout() async {
      await tester.tap(find.byTooltip('Account settings'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Log out'));
      await tester.tap(find.text('Log out'));
      await tester.pumpAndSettle();
    }

    await openLogout();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(repo.logouts, 0);
    await openLogout();
    await tester.tap(find.widgetWithText(TextButton, 'Log out'));
    await tester.pumpAndSettle();
    expect(repo.logouts, 1);
    expect(find.text('Opened /login'), findsOneWidget);
  });

  for (final size in [
    const Size(320, 568),
    const Size(568, 320),
    const Size(768, 1024),
  ]) {
    testWidgets(
      'profile and skeleton stay scrollable at $size with large text',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final ready = Completer<SettingsAccount>();
        final repo = FakeSettingsRepository()..response = () => ready.future;
        await tester.pumpWidget(screen(repo, textScale: 1.8));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        ready.complete(rider);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.text('Payment Methods'));
        await tester.tap(find.byTooltip('Account settings'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.text('Log out'));
        expect(tester.takeException(), isNull);
      },
    );
  }
}

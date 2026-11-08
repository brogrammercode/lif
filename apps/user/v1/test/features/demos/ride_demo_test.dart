import 'package:user/features/demos/widgets/demo_launcher.dart';
import 'package:user/features/rides/controllers/trip_safety_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:user/features/demos/controllers/ride_demo_controller.dart';
import 'package:user/features/demos/pages/ride_demo_host.dart';
import 'package:user/features/home/pages/home_page.dart';
import 'package:user/features/rides/pages/vehicle_selection_page.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/rides/controllers/rider_trip_controller.dart';
import 'package:user/features/rides/controllers/vehicle_selection_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  test(
    'demo adapters use production booking controller and retain selection',
    () async {
      final demo = RideDemoController();
      final repo = UserAppRepository(client: demo.transport);
      final selection = VehicleSelectionController(
        repository: repo,
        input: demo.endpoints,
        quote: await repo.requestQuote(demo.endpoints),
      );
      selection.select(1);
      selection.changePassengers(1);
      selection.changeNote('UI test pickup note');
      expect(await selection.submit(), RideDemoController.tripId);
      expect(demo.status, 'SEARCHING');
      expect(demo.passengers, 2);
      expect(demo.selectedQuote['id'], 'demo-car');
      selection.dispose();
      demo.dispose();
    },
  );
  test(
    'all trip stages satisfy production context verification and source changes',
    () async {
      final demo = RideDemoController();
      final trip = RiderTripController(
        repository: UserAppRepository(client: demo.transport),
        ops: DriverOperationsRepository(client: demo.transport),
      );
      trip.open(
        RideDemoController.tripId,
        source: demo,
        livePresentation: true,
      );
      for (final stage in RideDemoStep.values.skip(3)) {
        await trip.readDone?.future;
        demo.preview(stage);
        await trip.readDone?.future;
        expect(trip.error, isNull, reason: stage.name);
        expect(trip.status, demo.status);
        expect(trip.data?['is_driver'], false);
      }
      trip.dispose();
      demo.restart();
      demo.dispose();
      await expectLater(demo.transport.getData('/me'), throwsStateError);
    },
  );
  test(
    'unsupported actions cannot reach real services and responses are detached',
    () async {
      final demo = RideDemoController();
      await expectLater(demo.transport.postData('/payments'), throwsStateError);
      await expectLater(
        demo.transport.getData('/driver/dashboard'),
        throwsStateError,
      );
      expect(() => demo.transport.dio, throwsStateError);
      final repo = UserAppRepository(client: demo.transport);
      final first = await repo.profile();
      final safety = TripSafetyController(repo, allowExternalActions: false);
      expect(await safety.openExternal(Uri.https('wa.me')), false);
      safety.dispose();
      first['first_name'] = 'Changed';
      expect((await repo.profile())['first_name'], 'Aarav');
      demo.preview(RideDemoStep.inProgress);
      demo.preview(RideDemoStep.arrived);
      expect(demo.riderConfirmed, false);
      expect(demo.driverVerified, false);
      demo.restart();
      expect(demo.riderConfirmed, false);
      expect(demo.driverVerified, false);
      expect(demo.status, 'DRAFT');
      demo.dispose();
    },
  );
  testWidgets(
    'demo hosts the production pages and stage controls without a second flow UI',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ScreenUtilInit(
          designSize: const Size(390, 844),
          builder: (_, _) => MaterialApp(
            home: RideDemoHost(
              mapBuilder: (_) => const ColoredBox(color: Colors.grey),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(HomePage), findsOneWidget);
      expect(tester.takeException(), isNull, reason: 'Home layout');
      await tester.tap(find.byTooltip('Choose demo stage'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Vehicles').last);
      await tester.pumpAndSettle();
      expect(find.byType(VehicleSelectionPage), findsOneWidget);
      expect(find.text('Comfort'), findsOneWidget);
      expect(tester.takeException(), isNull, reason: 'Vehicle layout');
      await tester.tap(find.textContaining('Continue to book Bike'));
      await tester.pumpAndSettle();
      expect(find.byType(RideDetailPage), findsOneWidget);
      expect(find.text('Finding your driver'), findsOneWidget);
      await tester.tap(find.byTooltip('Choose demo stage'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Driver assigned').last);
      await tester.pumpAndSettle();
      expect(find.byType(RideDetailPage), findsOneWidget);
      expect(find.text('Get ready, the driver will come soon'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'home demo launcher opens registry, starts production flow and closes cleanly',
    (tester) async {
      await tester.pumpWidget(
        ScreenUtilInit(
          designSize: const Size(390, 844),
          builder: (_, _) => MaterialApp(
            home: Scaffold(
              body: DemoLauncher(mapBuilder: (_) => const SizedBox()),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Demo'));
      await tester.pumpAndSettle();
      expect(find.text('UI demo flows'), findsOneWidget);
      await tester.tap(find.text('Ride booking flow'));
      await tester.pumpAndSettle();
      expect(find.byType(HomePage), findsOneWidget);
      await tester.tap(find.byTooltip('Close demo'));
      await tester.pumpAndSettle();
      expect(find.byType(RideDemoHost), findsNothing);
      expect(find.text('Demo'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

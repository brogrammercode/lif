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
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/features/rides/controllers/rider_trip_controller.dart';
import 'package:user/features/rides/controllers/vehicle_selection_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  test('demo fixture provides usable photography for every image slot', () {
    final demo = RideDemoController();
    bool isHttpsImage(dynamic value) =>
        value is String && Uri.tryParse(value)?.scheme == 'https';

    expect(isHttpsImage(demo.profile['avatar_url']), isTrue);
    expect(isHttpsImage(demo.driver['user']['avatar_url']), isTrue);
    expect(isHttpsImage(demo.vehicleFor('demo-bike')['photo_url']), isTrue);
    expect(isHttpsImage(demo.vehicleFor('demo-car')['photo_url']), isTrue);
    expect(isHttpsImage(demo.vehicleFor('demo-xl')['photo_url']), isTrue);
    expect(
      isHttpsImage(demo.vehicleFor('demo-bike')['brand']['logo_url']),
      isTrue,
    );
    expect(
      isHttpsImage(demo.vehicleFor('demo-car')['brand']['logo_url']),
      isTrue,
    );
    expect(
      demo.vehicleFor('demo-bike')['brand']['logo_url'],
      'https://res.cloudinary.com/drxuvrw65/image/upload/v1792684132/1more-admin/vehicle-brands/74618f08-2e02-44c2-a9d5-42213978f227.webp',
    );
    expect(
      (demo.quote['quotes'] as List).every(
        (quote) => isHttpsImage(quote['category_snapshot']['image_url']),
      ),
      isTrue,
    );
    final activeCategoryImages = {
      'BIKE':
          'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312100/1more-admin/vehicle-categories/ba556f0c-7fbd-457d-b29f-265c65db5a45.webp',
      'SEDAN':
          'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312253/1more-admin/vehicle-categories/573d83dd-92e3-4d0b-8192-a268b324ea36.webp',
      'SUV':
          'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312264/1more-admin/vehicle-categories/a7629980-03b1-47ec-a253-6d926e1c6af8.webp',
    };
    for (final quote in demo.quote['quotes'] as List) {
      final type = quote['vehicle_type'];
      expect(
        quote['category_snapshot']['image_url'],
        activeCategoryImages[type],
      );
    }
    expect(
      demo.places.every(
        (place) =>
            (place['photos'] as List).isNotEmpty &&
            (place['photos'] as List).every(
              (photo) => isHttpsImage(photo['url']),
            ),
      ),
      isTrue,
    );
    demo.dispose();
  });
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
      expect(selection.driverDistanceLabel({'distance_m': 620}), '620 m away');
      expect(
        selection.driverDistanceLabel({'distance_m': 1450}),
        '1.5 km away',
      );
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
      expect(find.text('Passengers'), findsOneWidget);
      expect(find.text('Pay the driver after your ride'), findsNothing);
      expect(find.text('Pickup note (optional)'), findsNothing);
      final panel = find.byKey(const ValueKey('ride-stage-panel'));
      final panelContent = find.byKey(
        const ValueKey('vehicle-selection-content'),
      );
      final naturalContentHeight = tester.getSize(panelContent).height;
      final initialPanelHeight = tester.getSize(panel).height;
      await tester.drag(panel, const Offset(0, -600));
      await tester.pumpAndSettle();
      final expandedPanelHeight = tester.getSize(panel).height;
      expect(expandedPanelHeight, greaterThan(initialPanelHeight));
      expect(
        expandedPanelHeight,
        lessThanOrEqualTo(naturalContentHeight + 110),
      );
      expect(find.text('620 m away'), findsOneWidget);
      final bookingAction = find.text('Continue');
      await tester.ensureVisible(bookingAction);
      await tester.pumpAndSettle();
      final button = find.ancestor(
        of: bookingAction,
        matching: find.byType(FilledButton),
      );
      expect(tester.getSize(button).height, greaterThanOrEqualTo(60));
      await tester.tap(bookingAction);
      await tester.pumpAndSettle();
      expect(find.byType(RideDetailPage), findsOneWidget);
      expect(find.text('Finding your driver'), findsOneWidget);
      await tester.drag(
        find.byKey(const ValueKey('ride-stage-panel')),
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();
      expect(find.text('Searching nearby driver'), findsOneWidget);
      expect(find.text('Search area · 2 km'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.textContaining('We expand the search'), findsNothing);
      expect(find.byType(RideEndpoints), findsNothing);
      final cancelButton = find.ancestor(
        of: find.text('Cancel'),
        matching: find.byType(OutlinedButton),
      );
      expect(tester.getSize(cancelButton).height, 60);
      expect(tester.takeException(), isNull, reason: 'Searching layout');
      await tester.tap(find.byTooltip('Choose demo stage'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Driver assigned').last);
      await tester.pumpAndSettle();
      expect(find.byType(RideDetailPage), findsOneWidget);
      expect(find.text('The driver will arrive in'), findsOneWidget);
      expect(find.text('Your driver'), findsOneWidget);
      final driverName = tester.widget<Text>(find.text('Rohan Kumar'));
      expect(driverName.style?.fontWeight, FontWeight.w500);
      expect(
        tester.getSize(find.byType(RideVehicleDriverCard)).width,
        greaterThan(300),
      );
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Choose demo stage'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Completed').last);
      await tester.pumpAndSettle();
      expect(find.byType(DraggableScrollableSheet), findsOneWidget);
      expect(find.text("You've arrived"), findsOneWidget);
      expect(find.text('Trip Details'), findsOneWidget);
      expect(find.text('Download bill'), findsOneWidget);
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

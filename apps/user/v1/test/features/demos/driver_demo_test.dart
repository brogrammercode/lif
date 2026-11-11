import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:user/features/demos/controllers/driver_demo_controller.dart';
import 'package:user/features/demos/controllers/ride_demo_controller.dart';
import 'package:user/features/demos/pages/driver_demo_host.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  test(
    'driver demo exercises server-shaped transitions without real services',
    () async {
      final demo = DriverDemoController();
      final repo = DriverOperationsRepository(client: demo.transport);
      final vehicle = demo.contextData['trip']['vehicle'];
      expect(demo.contextData['is_driver'], true);
      expect(demo.contextData['trip']['rider']['first_name'], 'Aarav');
      expect(await repo.accept('demo-driver-offer'), RideDemoController.tripId);
      expect(demo.phase, DriverDemoPhase.arriving);
      await repo.arrive(RideDemoController.tripId);
      await expectLater(
        repo.start(RideDemoController.tripId, '000000'),
        throwsStateError,
      );
      expect(demo.phase, DriverDemoPhase.waiting);
      await repo.start(RideDemoController.tripId, '162904');
      expect(demo.phase, DriverDemoPhase.inProgress);
      await repo.complete(RideDemoController.tripId);
      expect(demo.phase, DriverDemoPhase.payment);
      expect(demo.contextData['payment']['status'], 'PENDING');
      await repo.collection(RideDemoController.tripId, 'CASH', true, null);
      expect(demo.phase, DriverDemoPhase.completed);
      expect(demo.contextData['payment']['status'], 'CAPTURED');
      expect(demo.contextData['trip']['vehicle'], vehicle);
      demo.dispose();
    },
  );
  testWidgets(
    'all driver phases reuse the ride shell and show rider identity',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 740));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ScreenUtilInit(
          designSize: const Size(390, 844),
          builder: (_, _) => MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(1.3)),
              child: child!,
            ),
            home: DriverDemoHost(
              mapBuilder: (_) => const ColoredBox(color: Colors.grey),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(RiderFlowScaffold), findsOneWidget);
      expect(find.text('Aarav Sharma'), findsOneWidget);
      for (final phase in DriverDemoPhase.values.skip(1)) {
        tester
            .widget<PopupMenuButton<DriverDemoPhase>>(
              find.byType(PopupMenuButton<DriverDemoPhase>),
            )
            .onSelected!(phase);
        await tester.pumpAndSettle();
        expect(find.byType(RiderFlowScaffold), findsOneWidget);
        expect(find.text('Aarav Sharma'), findsOneWidget);
        expect(find.text('Handoko Mulyono'), findsNothing);
        expect(
          tester.takeException(),
          isNull,
          reason: 'Layout failed in $phase',
        );
      }
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('production payment slider advances driver demo', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ScreenUtilInit(
        designSize: const Size(390, 844),
        builder: (_, _) => MaterialApp(
          home: DriverDemoHost(mapBuilder: (_) => const SizedBox()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    tester
        .widget<PopupMenuButton<DriverDemoPhase>>(
          find.byType(PopupMenuButton<DriverDemoPhase>),
        )
        .onSelected!(DriverDemoPhase.payment);
    await tester.pumpAndSettle();
    expect(find.text('Collect the ride fare'), findsOneWidget);
    final slider = tester.widget<RideSwipeButton>(find.byType(RideSwipeButton));
    expect(slider.label, 'Slide to confirm payment');
    slider.onSwipe();
    await tester.pumpAndSettle();
    expect(find.text('Ride completed'), findsOneWidget);
    expect(find.text('Aarav Sharma'), findsOneWidget);
    expect(find.text('Collect the ride fare'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

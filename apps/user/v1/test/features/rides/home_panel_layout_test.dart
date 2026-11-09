import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:user/components/ui/app_logo.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/demos/controllers/ride_demo_controller.dart';
import 'package:user/features/home/pages/home_page.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/features/rides/widgets/ride_map_pin_assets.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  testWidgets('a bounded ordinary place card keeps its content scrollable', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SolidScope(
          child: Scaffold(
            body: Center(
              child: SizedBox(
                width: 140,
                height: 160,
                child: PlaceCard(
                  place: const {
                    'name': 'A long railway station name in Bhagalpur',
                    'address': 'A long address for the bounded-card regression',
                    'place_type': 'OTHER',
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final scroll = find.descendant(
      of: find.byType(PlaceCard),
      matching: find.byType(SingleChildScrollView),
    );
    expect(tester.getSize(scroll).height, lessThanOrEqualTo(160));
    await tester.drag(scroll, const Offset(0, -150));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('optional black header preserves bounded scrolling body', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SolidScope(
          child: Scaffold(
            body: Center(
              child: SizedBox(
                width: 320,
                height: 220,
                child: SolidSurface(
                  blackHeight: 54,
                  upperChild: const RideArrivalStrip(
                    label: 'The driver will arrive in',
                    value: '5 min',
                  ),
                  child: ListView(
                    children: List.generate(12, (i) => Text('Detail $i')),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('5 min'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -200));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('map ride stages share one black and white parent panel', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: RiderFlowScaffold(
          title: 'Finding your driver',
          statusStrip: const RideArrivalStrip(
            label: 'Finding your driver',
            value: '2 min',
          ),
          map: const ColoredBox(
            key: ValueKey('stage-map'),
            color: Colors.blueGrey,
          ),
          panel: ListView(children: const [Text('Stage content')]),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final stage = find.byKey(const ValueKey('ride-stage-panel'));
    final map = find.byKey(const ValueKey('stage-map'));
    expect(stage, findsOneWidget);
    expect(
      tester.getSize(map).height,
      closeTo(tester.getSize(find.byType(Scaffold)).height * .80, .1),
    );
    expect(
      find.descendant(of: stage, matching: find.text('Finding your driver')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: stage, matching: find.text('Stage content')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  for (final size in [
    const Size(390, 844),
    const Size(320, 568),
    const Size(568, 320),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Home places stay outside route panel at $size text $scale', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final demo = RideDemoController();
        await tester.pumpWidget(
          ScreenUtilInit(
            designSize: const Size(390, 844),
            builder: (_, _) => MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: DataSourceScope(
                client: demo.transport,
                isDemo: true,
                initialEndpoints: () => demo.endpoints,
                child: HomePage(
                  showDemoLauncher: false,
                  mapBuilder: (_) => const SizedBox(key: ValueKey('home-map')),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final strip = find.byKey(const ValueKey('home-place-strip'));
        final panel = find.byKey(const ValueKey('home-route-panel'));
        expect(strip, findsOneWidget);
        expect(
          find.descendant(of: panel, matching: find.byType(PlaceCard)),
          findsNothing,
        );
        expect(
          tester.getBottomLeft(strip).dy,
          lessThan(tester.getTopLeft(panel).dy),
        );
        expect(find.byType(RideArrivalStrip), findsOneWidget);
        expect(find.byType(AppLogo), findsNothing);
        expect(
          tester.getSize(find.byKey(const ValueKey('home-map'))).height,
          closeTo(tester.getSize(find.byType(Scaffold)).height * .80, .1),
        );
        expect(find.text('Plan your ride'), findsOneWidget);
        expect(find.byType(RideSwipeButton), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        demo.dispose();
      });
    }
  }

  testWidgets('location-selection pin renders at half its former size', (
    tester,
  ) async {
    final demo = RideDemoController();
    await tester.pumpWidget(
      ScreenUtilInit(
        designSize: const Size(390, 844),
        builder: (_, _) => MaterialApp(
          home: DataSourceScope(
            client: demo.transport,
            changes: demo,
            initialEndpoints: () => demo.endpoints,
            userId: RideDemoController.riderId,
            isDemo: true,
            child: HomePage(
              showDemoLauncher: false,
              locationSelection: true,
              endpoints: demo.endpoints,
              editPickup: true,
              mapBuilder: (_) => const SizedBox(),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final pin = tester.widget<Image>(
      find.byKey(const ValueKey('home-location-selection-pin')),
    );
    expect(pin.width, closeTo(32.r, .01));
    expect(pin.height, closeTo(32.r, .01));
    expect(find.byType(RideSwipeButton), findsNothing);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    demo.dispose();
  });

  testWidgets('ride swipe only proceeds after a deliberate full swipe', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 320,
              child: RideSwipeButton(enabled: true, onSwipe: () => calls++),
            ),
          ),
        ),
      ),
    );
    final swipe = find.byKey(const ValueKey('ride-swipe-button'));
    final trail = find.byKey(const ValueKey('ride-swipe-trail'));
    final hintLayer = find.byKey(const ValueKey('ride-swipe-hint-layer'));
    final car = find.byKey(const ValueKey('ride-swipe-car'));
    expect(tester.getSize(swipe).height, 64);
    expect(tester.getSize(trail).height, 12);
    expect(tester.getSize(trail).width, lessThan(80));
    expect(find.byKey(const ValueKey('ride-swipe-frame')), findsNothing);
    final trailContainer = tester.widget<Container>(
      find.descendant(of: trail, matching: find.byType(Container)).first,
    );
    final trailDecoration = trailContainer.decoration! as BoxDecoration;
    expect((trailDecoration.gradient! as LinearGradient).colors, [
      Colors.blue,
      Colors.blueAccent,
    ]);
    expect(find.byKey(const ValueKey('ride-swipe-hint')), findsOneWidget);
    final sliderStack = tester.widget<Stack>(
      find.descendant(of: swipe, matching: find.byType(Stack)).first,
    );
    expect(
      sliderStack.children.last.key,
      const ValueKey('ride-swipe-hint-layer'),
    );
    expect(
      tester.getTopLeft(hintLayer).dy,
      lessThan(tester.getTopLeft(car).dy),
    );
    final gesture = await tester.startGesture(tester.getCenter(swipe));
    await gesture.moveBy(const Offset(160, 0));
    await tester.pump();
    expect(find.byKey(const ValueKey('ride-swipe-prompt')), findsNothing);
    expect(find.byKey(const ValueKey('ride-swipe-hint')), findsNothing);
    expect(trail, findsOneWidget);
    expect(find.byKey(const ValueKey('ride-swipe-car')), findsOneWidget);
    await gesture.up();
    await tester.pumpAndSettle();
    await tester.drag(swipe, const Offset(80, 0));
    await tester.pumpAndSettle();
    expect(calls, 0);
    await tester.drag(swipe, const Offset(280, 0));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(tester.takeException(), isNull);
  });

  test(
    'ride pin artwork keeps its shape and distinguishes endpoint colors',
    () async {
      final redCodec = await ui.instantiateImageCodec(
        await RideMapPinAssets.red(),
      );
      final greenCodec = await ui.instantiateImageCodec(
        await RideMapPinAssets.green(),
      );
      final red = (await redCodec.getNextFrame()).image;
      final green = (await greenCodec.getNextFrame()).image;
      addTearDown(() {
        red.dispose();
        green.dispose();
        redCodec.dispose();
        greenCodec.dispose();
      });
      expect(red.width, green.width);
      expect(red.height, green.height);
      final redPixels = await red.toByteData(
        format: ui.ImageByteFormat.rawRgba,
      );
      final greenPixels = await green.toByteData(
        format: ui.ImageByteFormat.rawRgba,
      );
      final sample = ((red.width * 120) + 256) * 4;
      expect(
        redPixels!.getUint8(sample),
        greaterThan(redPixels.getUint8(sample + 1)),
      );
      expect(
        greenPixels!.getUint8(sample + 1),
        greaterThan(greenPixels.getUint8(sample)),
      );
    },
  );
}

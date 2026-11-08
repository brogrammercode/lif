import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'phase_c_test.dart' show TripRepo, harness;

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=http://localhost/api/v2',
    ),
  );
  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'assigned reference has opaque surfaces, ETA strip, inline contacts and no blur at scale $scale',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final repo = TripRepo()..status = 'DRIVER_ASSIGNED';
        await tester.pumpWidget(
          harness(
            MediaQuery(
              data: MediaQueryData(
                size: const Size(390, 844),
                textScaler: TextScaler.linear(scale),
              ),
              child: RideDetailPage(
                operationsRepository: repo,
                mapBuilder: (_) => const ColoredBox(color: Color(0xFFEFEFEF)),
              ),
            ),
            ride: 'ride',
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(SolidScope), findsWidgets);
        expect(find.byType(BackdropFilter), findsNothing);
        expect(find.byType(RideArrivalStrip), findsOneWidget);
        expect(
          find.text('Get ready, the driver will come soon'),
          findsOneWidget,
        );
        await tester.scrollUntilVisible(
          find.byTooltip('Chat with driver'),
          80,
          scrollable: find
              .byWidgetPredicate(
                (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
              )
              .first,
        );
        await tester.pumpAndSettle();
        expect(find.byTooltip('Call driver'), findsOneWidget);
        expect(find.byTooltip('Chat with driver'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

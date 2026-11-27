import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/app_error_snackbar.dart';

void main() {
  testWidgets('uses one bottom snackbar across a page and a keyboard sheet', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Column(
              children: [
                TextButton(
                  onPressed: () => showAppError(context, 'Page warning'),
                  child: const Text('Warn'),
                ),
                TextButton(
                  onPressed: () => showModalBottomSheet<void>(
                    context: context,
                    builder: (context) => AppErrorNotice(
                      message: 'Sheet error',
                      child: TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Close sheet'),
                      ),
                    ),
                  ),
                  child: const Text('Open sheet'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Warn'));
    await tester.pumpAndSettle();
    expect(find.text('Page warning'), findsOneWidget);
    final pageBottom = tester.getCenter(find.text('Page warning')).dy;

    tester.view.viewInsets = const FakeViewPadding(bottom: 160);
    addTearDown(tester.view.resetViewInsets);
    await tester.tap(find.text('Open sheet'));
    await tester.pumpAndSettle();
    expect(find.text('Page warning'), findsNothing);
    expect(find.text('Sheet error'), findsOneWidget);
    expect(
      tester.getCenter(find.text('Sheet error')).dy,
      closeTo(pageBottom - 160 / tester.view.devicePixelRatio, 0.01),
    );

    await tester.tap(find.text('Close sheet'));
    await tester.pumpAndSettle();
    expect(find.text('Sheet error'), findsNothing);

    await tester.tap(find.text('Warn'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 4));
    expect(find.text('Page warning'), findsNothing);
  });
}

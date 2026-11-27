import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

Future<void> showWalletSheet(
  BuildContext context, {
  required String title,
  required Widget content,
  String? value,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: false,
  backgroundColor: Colors.transparent,
  builder: (sheetContext) => Padding(
    padding: EdgeInsets.only(
      bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
    ),
    child: SolidScope(
      child: RideStagePanel(
        header: RideArrivalStrip(label: title, value: value ?? ''),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: RideSheetHandle()),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                  child: content,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  ),
);

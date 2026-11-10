import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/demos/controllers/demo_registry_controller.dart';
import 'package:user/features/demos/pages/ride_demo_host.dart';
import 'package:user/features/demos/pages/driver_demo_host.dart';

class DemoLauncher extends StatelessWidget {
  final Widget Function(Widget)? mapBuilder;
  const DemoLauncher({super.key, this.mapBuilder});
  Future<void> _open(BuildContext context) async {
    final registry = DemoRegistryController();
    DemoFlowId? selected;
    try {
      selected = await showModalBottomSheet<DemoFlowId>(
        context: context,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) => SolidSheet(
          child: ListenableBuilder(
            listenable: registry,
            builder: (_, _) => ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
              children: [
                const Text(
                  'UI demo flows',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 12),
                for (final flow in registry.flows)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(flow.title),
                    subtitle: Text(flow.description),
                    leading: const Icon(Icons.route_outlined),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.pop(context, flow.id),
                  ),
              ],
            ),
          ),
        ),
      );
    } finally {
      registry.dispose();
    }
    if (!context.mounted || selected == null) return;
    switch (selected) {
      case DemoFlowId.driverRide:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => DriverDemoHost(mapBuilder: mapBuilder),
          ),
        );
      case DemoFlowId.rideBooking:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => RideDemoHost(mapBuilder: mapBuilder),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: () => _open(context),
    icon: const Icon(Icons.science_outlined, size: 18),
    label: const Text('Demo'),
  );
}

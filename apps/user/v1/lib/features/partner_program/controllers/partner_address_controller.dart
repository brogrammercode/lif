import 'package:user/features/partner_program/partner_program.repo.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/feature_controller.dart';

/// Canonical postal selections; the combined requirement remains one answer.

/// Owns feature records, query state and asynchronous loading independently of its view.
class PartnerAddressController extends FeatureController {
  List<String> states = [], cities = [], pins = [];
  String? state, city, pin, error;
  bool loading = true;
  int request = 0;

  String? linkedState, linkedCity;
  Future<void> load() async {
    final request = ++this.request;
    update(() {
      loading = true;
      error = null;
    });
    try {
      final data = await PartnerProgramRepository().geography(
        state: state,
        city: linkedState == '' ? null : city,
        pincode: linkedState == '' || linkedCity == '' ? null : pin,
      );
      if (isDisposed || request != this.request) return;
      update(() {
        states = List<String>.from(data['states'] as List);
        cities = List<String>.from(data['cities'] as List);
        pins = List<String>.from(data['pincodes'] as List);
        state ??= data['selected_state'] as String?;
        city ??= data['selected_city'] as String?;
      });
    } catch (error) {
      if (!isDisposed && request == this.request) {
        update(() => this.error = ApiResult.errorMessage(error));
      }
    } finally {
      if (!isDisposed && request == this.request) update(() => loading = false);
    }
  }
}

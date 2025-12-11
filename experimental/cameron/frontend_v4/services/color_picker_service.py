"""
Color Picker Service - Wrapper for RPA Color Picker
"""

try:
    from PySide2.QtCore import Property, QObject, Signal, Slot
    from PySide2.QtGui import QColor
    from PySide2.QtWidgets import QDialog
except ImportError:
    from PySide6.QtCore import Property, QObject, Signal, Slot
    from PySide6.QtGui import QColor
    from PySide6.QtWidgets import QDialog

from widgets.color_picker.controller import Controller as ColorPickerController
from widgets.color_picker.model import Model as ColorPickerModel
from widgets.color_picker.view.view import View as ColorPickerView


class ColorPickerService(QObject):
    """Service to integrate RPA Color Picker with our theme manager"""

    colorSelected = Signal(str)  # Emits hex color string

    def __init__(self, parent=None):
        super().__init__(parent)
        self._dialog = None
        self._model = None
        self._view = None
        self._controller = None

    @Slot(str)
    def showColorPicker(self, initial_color="#ffffff"):
        """Show the color picker dialog with an initial color"""
        try:
            print(f"showColorPicker called with initial_color: {initial_color}")

            # Create model, view, and controller
            self._model = ColorPickerModel()
            self._view = ColorPickerView()
            self._controller = ColorPickerController(self._model, self._view)

            # Set initial color
            if initial_color:
                # Parse hex color
                color = QColor(initial_color)
                from widgets.color_picker.model import Rgb

                # RPA color picker uses float values 0.0-1.0, not 0-255
                rgb = Rgb(
                    color.red() / 255.0, color.green() / 255.0, color.blue() / 255.0
                )
                print(
                    f"Setting initial color RGB floats: ({color.red() / 255.0:.3f}, {color.green() / 255.0:.3f}, {color.blue() / 255.0:.3f})"
                )
                self._controller.set_current_color(rgb)
                # Also set as the starting color so it shows in the "before" swatch
                self._view.set_starting_color(rgb)

            # Show the dialog modally and wait for result
            result = self._view.exec()

            # If accepted (OK clicked), emit the color
            if result == QDialog.Accepted:
                self._on_color_selected()

        except Exception as e:
            print(f"ERROR: Failed to show color picker: {e}")
            import traceback

            traceback.print_exc()

    def _on_color_selected(self):
        """Handle color selection when OK button is pressed"""
        try:
            # Get the selected color from the model
            color = self._model.get_current_color()

            # get_rgb() returns a tuple (red, green, blue) as floats 0.0-1.0
            red, green, blue = color.get_rgb()

            # Convert from float (0.0-1.0) to int (0-255) then to hex
            red_int = int(red * 255)
            green_int = int(green * 255)
            blue_int = int(blue * 255)

            hex_color = "#{:02x}{:02x}{:02x}".format(red_int, green_int, blue_int)

            # Emit the signal
            self.colorSelected.emit(hex_color)

            print(
                f"Color selected: RGB({red:.3f}, {green:.3f}, {blue:.3f}) -> {hex_color}"
            )

        except Exception as e:
            print(f"ERROR: Failed to get selected color: {e}")
            import traceback

            traceback.print_exc()

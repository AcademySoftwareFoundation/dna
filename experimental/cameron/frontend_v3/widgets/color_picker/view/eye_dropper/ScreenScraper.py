try:
    from PySide2 import QtCore, QtGui, QtWidgets

    # Qt5 uses Background/Foreground
    PALETTE_BACKGROUND = QtGui.QPalette.Background
    PALETTE_FOREGROUND = QtGui.QPalette.Foreground
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets

    # Qt6 uses Window/WindowText instead
    PALETTE_BACKGROUND = QtGui.QPalette.Window
    PALETTE_FOREGROUND = QtGui.QPalette.WindowText
from widgets.sub_widgets.color_circle import Rgb


class CursorWidget(QtWidgets.QFrame):
    PREVIEW_TILE_HEIGHT = 20

    def __init__(self, *args):
        super().__init__(
            None, QtCore.Qt.FramelessWindowHint | QtCore.Qt.WindowStaysOnTopHint
        )
        self.__pixmap = None
        self.__previewColor = QtGui.QColor(0, 0, 0)

        self.setLineWidth(1)
        self.setFrameShape(QtWidgets.QFrame.Box)

        # set background/foreground
        border_contrast = 80
        bg_color = self.palette().color(PALETTE_BACKGROUND)
        self.palette().setColor(
            PALETTE_FOREGROUND,
            QtGui.QColor(
                bg_color.red() + border_contrast,
                bg_color.green() + border_contrast,
                bg_color.blue() + border_contrast,
            ),
        )

    def set_pixmap(self, pixmap):
        cross_border = 4
        frame_width = self.width()
        frame_height = self.height() - self.PREVIEW_TILE_HEIGHT
        self.__pixmap = QtGui.QPixmap(frame_width, frame_height)
        painter = QtGui.QPainter(self.__pixmap)

        half_pixel_offset = (
            0.5 * frame_width / float(pixmap.width()),
            0.5 * frame_height / float(pixmap.height()),
        )
        center = (
            frame_width / 2 + half_pixel_offset[0],
            frame_height / 2 + half_pixel_offset[1],
        )

        # Draw bg image
        painter.drawImage(0, 0, pixmap.toImage().scaled(frame_width, frame_height))

        # Draw cross
        painter.setPen(self.palette().color(PALETTE_FOREGROUND))
        painter.drawLine(center[0], cross_border, center[0], center[1] - cross_border)
        painter.drawLine(
            center[0], frame_height - cross_border, center[0], center[1] + cross_border
        )
        painter.drawLine(cross_border, center[1], center[0] - cross_border, center[1])
        painter.drawLine(
            frame_width - cross_border, center[1], center[0] + cross_border, center[1]
        )

        painter.end()
        self.update()

    def paintEvent(self, event):
        if self.__pixmap:
            painter = QtGui.QPainter(self)
            painter.drawPixmap(0, 0, self.__pixmap)

            # Display color that is being sampled in a tile under cursor
            painter.setPen(QtGui.QColor(0, 0, 0))
            painter.setBrush(self.__previewColor)
            painter.drawRect(
                0,
                self.height() - self.PREVIEW_TILE_HEIGHT,
                self.width(),
                self.PREVIEW_TILE_HEIGHT,
            )
            painter.end()

        super().paintEvent(event)

    def set_preview_color(self, color):
        self.__previewColor = QtGui.QColor(*map(lambda x: int(x * 255.0), color))


class ScreenScraper(QtWidgets.QWidget):
    SIG_COLOR = QtCore.Signal(tuple)  # color
    SIG_SAMPLE_SIZE = QtCore.Signal(int)

    def __init__(self, parent):
        super().__init__(parent)
        self.__read_only = False
        self.setMouseTracking(True)
        self.__grab = False
        self.__cursor_pos = None
        self.__color = None
        self.__sample_size = 1
        self.__drag_object = None
        self.__queued_color = False

        self.__cursor_widget = CursorWidget()
        self.__cursor_widget.hide()

        self.__dispatch_delay_ms = 100
        self._dispatch_event_timer = QtCore.QTimer(self)
        self._dispatch_event_timer.timeout.connect(self.dispatch_event)
        self.__screen = QtGui.QGuiApplication.primaryScreen()

    def closeEvent(self, event):
        if self.__grab:
            self.__stop_sampling()

    def hideEvent(self, event):
        if self.__grab:
            self.__stop_sampling()

    def mousePressEvent(self, event):
        if self.__grab:
            self.__stop_sampling()
        else:
            self.__start_sampling()

    def mouseMoveEvent(self, event):
        if self.__grab:
            self.__cursor_pos = QtGui.QCursor.pos()
            self.__update_cursor()

    def __start_sampling(self):
        self.__grab = True
        self.__cursor_pos = QtGui.QCursor.pos()
        self.grabMouse()
        self.__update_cursor()
        self.__cursor_widget.show()
        self.cursor = QtGui.QCursor(QtCore.Qt.CrossCursor)
        self.setCursor(self.cursor)
        self._dispatch_event_timer.start(self.__dispatch_delay_ms)

    def start_sampling(self):
        if not self.__grab:
            self.__start_sampling()

    def __stop_sampling(self):
        self.__grab = False
        self.releaseMouse()
        self.__cursor_widget.hide()
        self.unsetCursor()
        self._dispatch_event_timer.stop()
        if not self.__read_only:
            self.__set_color(self.__color)

    def stop_sampling(self):
        if self.__grab:
            self.__stop_sampling()

    def dispatch_event(self):
        if self.__queued_color and (not self.__read_only):
            self.__queued_color = False
            self.__set_color(self.__color, final=False)

        self._dispatch_event_timer.setInterval(self.__dispatch_delay_ms)

    def __set_color(self, color, final=True):
        if final:
            self.SIG_COLOR.emit(Rgb(*color))

    def __update_cursor(self):
        cursor_size = (64, 84)
        zoom = 8
        mouse_offset = (12, 12)

        capture_radius = (cursor_size[0] / zoom, cursor_size[1] / zoom)
        x, y = self.__cursor_pos.x(), self.__cursor_pos.y()
        self.__cursor_widget.setGeometry(
            x + mouse_offset[0], y + mouse_offset[1], cursor_size[0], cursor_size[1]
        )

        # Qt6 compatible screen grabbing
        capture_rect = QtCore.QRect(
            int(x - capture_radius[0]),
            int(y - capture_radius[1]),
            int(2 * capture_radius[0]),
            int(2 * capture_radius[1]),
        )
        pixmap = self.__screen.grabWindow(
            0,
            capture_rect.x(),
            capture_rect.y(),
            capture_rect.width(),
            capture_rect.height(),
        )
        self.__cursor_widget.set_pixmap(pixmap)

        color = self.sample_average_color(x, y)
        self.__cursor_widget.set_preview_color(color)

        if self.__color == color:
            return

        # Reset event timer, this throttles the sending of dispatch events.
        self.__color = color
        self.__queued_color = True
        self._dispatch_event_timer.setInterval(self.__dispatch_delay_ms)

    def sample_average_color(self, x, y):
        """
        This method samples the average color across a square
        of pixels determined by the size.
        """
        r, g, b = 0, 0, 0
        size = self.__sample_size

        # Qt6 compatible screen grabbing
        pixmap = self.__screen.grabWindow(0, int(x), int(y), size, size)
        image = pixmap.toImage()

        for i in range(0, size):
            for j in range(0, size):
                qcolor = QtGui.QColor(image.pixel(i, j))

                r += qcolor.red()
                g += qcolor.green()
                b += qcolor.blue()

        size_squared = size**2
        avg_color = (r / size_squared, g / size_squared, b / size_squared)

        return (avg_color[0] / 255.0, avg_color[1] / 255.0, avg_color[2] / 255.0)

    def set_read_only(self, value):
        self.__read_only = value

    def set_sample_size(self, size):
        self.__sample_size = size

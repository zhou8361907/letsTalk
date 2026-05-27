"""Application settings and project-level constants."""

from pathlib import Path

APP_NAME = "AI Requirement OS"
APP_VERSION = "0.1.0"

PACKAGE_ROOT = Path(__file__).resolve().parent
SRC_ROOT = PACKAGE_ROOT.parent
PROJECT_ROOT = SRC_ROOT.parent
WORKSPACE_ROOT = PROJECT_ROOT.parent

DEFAULT_SAMPLE_PROJECT = WORKSPACE_ROOT / "test-project" / "RunningAccount-master"
DEFAULT_SAMPLE_FRONTEND = DEFAULT_SAMPLE_PROJECT / "vue"
DEFAULT_SAMPLE_BACKEND = DEFAULT_SAMPLE_PROJECT

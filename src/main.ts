import {
  MarkdownView,
  Plugin,
  Vault, 
  DataAdapter
} from 'obsidian';
import MomentDateRegex from './moment-date-regex';
import { NoteRefactorSettingsTab } from './settings-tab';
import { NoteRefactorSettings } from './settings';
import NRFile from './file';
import ObsidianFile from './obsidian-file';
import NRDoc, { ReplaceMode } from './doc';
import FileNameModal from './modal';

export default class NoteRefactor extends Plugin {
  settings: NoteRefactorSettings;
  momentDateRegex: MomentDateRegex;
  obsFile: ObsidianFile;
  file: NRFile;
  NRDoc: NRDoc;
  vault: Vault;
  vaultAdapter: DataAdapter;

  onInit() {}

  async onload() {
    console.log("Loading Note Refactor plugin");
    this.settings = (await this.loadData()) || new NoteRefactorSettings();
    this.momentDateRegex = new MomentDateRegex();
    this.obsFile = new ObsidianFile(this.settings, this.app)
    this.file = new NRFile(this.settings);
    this.NRDoc = new NRDoc(this.settings);
    
    this.addCommand({
      id: 'app:extract-selection-first-line',
      name: 'Extract selection to new note - first line as file name',
      callback: () => this.editModeGuard(async () => await this.extractSelectionFirstLine('replace-selection')),
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "n",
        },
      ],
    });

    this.addCommand({
      id: 'app:extract-selection-content-only',
      name: 'Extract selection to new note - content only',
      callback: () => this.editModeGuard(() => this.extractSelectionContentOnly('replace-selection')),
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "c",
        },
      ],
    });

    this.addCommand({
      id: 'app:split-note-first-line',
      name: 'Split note here - first line as file name',
      callback: () => this.editModeGuard(() => this.extractSelectionFirstLine('split')),
    });

    this.addCommand({
      id: 'app:split-note-content-only',
      name: 'Split note here - content only',
      callback: () => this.editModeGuard(() => this.extractSelectionContentOnly('split')),
    });

    this.addCommand({
      id: 'app:split-note-by-heading-h1',
      name: 'Split note by headings - H1',
      callback: () => this.editModeGuard(() => this.splitOnHeading(1)),
    });

    this.addCommand({
      id: 'app:split-note-by-heading-h2',
      name: 'Split note by headings - H2',
      callback: () => this.editModeGuard(() => this.splitOnHeading(2)),
    });

    this.addCommand({
      id: 'app:split-note-by-heading-h3',
      name: 'Split note by headings - H3',
      callback: () => this.editModeGuard(() => this.splitOnHeading(3)),
    });

    this.addSettingTab(new NoteRefactorSettingsTab(this.app, this));
  }

  onunload() {
    console.log("Unloading Note Refactor plugin");
  }

  editModeGuard(command: () => any): void {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
    if(!mdView || mdView.getMode() !== 'source') {
      new Notification('Please use Note Refactor plugin in edit mode');
      return;
    } else {
      command();
    }
  }

  //TODO: Reintroduce this menu for heading splitting once it can be given keyboard input focus
  // showHeadingMenu() {
  //   const editor = this.app.workspace.getActiveLeafOfViewType(MarkdownView).sourceMode.cmEditor;
  //   const position = editor.cursorCoords(true, 'window');
  //   const menu = new Menu();
  //   [1,2,3,4].forEach(number => menu.addItem(item => item.setTitle(`H${number}`).onClick(() => this.splitOnHeading(number)).setActive(number === 1)));
  //   menu.showAtPosition({x: position.left, y: position.top});
  // }

  async splitOnHeading(headingLevel: number){
      const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
      const doc = mdView.sourceMode.cmEditor;
      const headingNotes = this.NRDoc.contentSplitByHeading(doc, headingLevel);
      headingNotes.forEach(hn => this.createNoteWithFirstLineAsFileName(hn, mdView, doc, 'replace-headings', false));
  }

  async extractSelectionFirstLine(mode: ReplaceMode): Promise<void> {
      const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
      const doc = mdView.sourceMode.cmEditor;
      if(!mdView) {return}
      
      const selectedContent = mode === 'split' ? this.NRDoc.noteRemainder(doc) : this.NRDoc.selectedContent(doc);
      if(selectedContent.length <= 0) { return }

      await this.createNoteWithFirstLineAsFileName(selectedContent, mdView, doc, mode, true);
  }

  private async createNoteWithFirstLineAsFileName(selectedContent: string[], mdView: MarkdownView, doc: CodeMirror.Editor, mode: ReplaceMode, openLink: boolean) {
    const [header, ...contentArr] = selectedContent;

    const fileName = this.file.sanitisedFileName(header);
    const originalNote = this.NRDoc.noteContent(header, contentArr);
    let note = originalNote;

    if (this.settings.refactoredNoteTemplate !== undefined && this.settings.refactoredNoteTemplate !== '') {
      note = this.NRDoc.templatedContent(note, this.settings.refactoredNoteTemplate, mdView.file.basename, fileName, note);
    }

    const exists = await this.obsFile.createFile(fileName, note);
    if (!exists) {
      this.NRDoc.replaceContent(fileName, doc, mdView.file.name, note, originalNote, mode);
      if(openLink) {
        await this.app.workspace.openLinkText(fileName, this.obsFile.filePath(this.app.workspace.activeLeaf.view), true);
      }
    }
  }

  extractSelectionContentOnly(mode:ReplaceMode): void {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
    if(!mdView) {return}
    const doc = mdView.sourceMode.cmEditor;
    
    const contentArr = mode === 'split' ? this.NRDoc.noteRemainder(doc): this.NRDoc.selectedContent(doc);
    if(contentArr.length <= 0) { return }
    this.loadModal(contentArr, doc, mode);
  }
  
  loadModal(contentArr:string[], doc:CodeMirror.Editor, mode:ReplaceMode): void {
    let note = this.NRDoc.noteContent(contentArr[0], contentArr.slice(1), true);

    new FileNameModal(this.app, this.settings, this.NRDoc, this.file, this.obsFile, note, doc, mode).open();
  }
}